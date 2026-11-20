@echo off
chcp 65001 >nul
setlocal
rem FechaRota no Windows: sobe o banco e o armazenamento (Docker), prepara o app e abre o navegador.
rem
rem   iniciar-fecharota.cmd             uso normal
rem   iniciar-fecharota.cmd atualizar   reinstala as dependências e refaz o build (depois de trocar o código)
rem   iniciar-fecharota.cmd reset       APAGA os dados locais e recria o banco de demonstração
rem
rem Pré-requisitos: Node.js 22 e Docker Desktop. O pnpm é instalado aqui se faltar.

cd /d "%~dp0"
title FechaRota

set "MODO=%~1"
if "%MODO%"=="" goto :modo_ok
if /i "%MODO%"=="atualizar" goto :modo_ok
if /i "%MODO%"=="reset" goto :modo_ok
echo Uso: iniciar-fecharota.cmd [atualizar ^| reset]
goto :falha
:modo_ok

rem --- Node.js 22 ---
where node >nul 2>&1
if errorlevel 1 (
  echo O Node.js não está instalado. Instale a versão 22 LTS em https://nodejs.org e rode de novo.
  goto :falha
)
set "NODE_MAJOR="
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
if not "%NODE_MAJOR%"=="v22" (
  echo Este projeto usa o Node.js 22, e o instalado é %NODE_MAJOR%. Instale a versão 22 LTS em https://nodejs.org e rode de novo.
  goto :falha
)

rem --- pnpm ---
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok
echo Instalando o pnpm 10.28.0...
call npm install -g pnpm@10.28.0
if errorlevel 1 goto :falha
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok
echo O pnpm foi instalado, mas esta janela ainda não o enxerga. Feche-a e rode o arquivo de novo.
goto :falha
:pnpm_ok

rem --- Já está no ar? ---
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3000/ >nul 2>&1
if errorlevel 1 goto :porta_livre
echo A porta 3000 já está em uso, provavelmente pelo FechaRota aberto em outra janela. Abrindo o navegador.
echo Se não for o FechaRota, feche o outro programa e rode este arquivo de novo.
start "" http://localhost:3000/
goto :sair
:porta_livre

rem --- Docker ---
where docker >nul 2>&1
if errorlevel 1 (
  echo O Docker Desktop não está instalado. Instale em https://www.docker.com/products/docker-desktop e rode de novo.
  goto :falha
)
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ok
echo Iniciando o Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a TENTATIVAS=0
:espera_docker
ping -n 3 127.0.0.1 >nul
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ok
set /a TENTATIVAS+=1
if %TENTATIVAS% lss 90 goto :espera_docker
echo O Docker não respondeu em 3 minutos. Abra o Docker Desktop, espere ele ficar pronto e rode de novo.
goto :falha
:docker_ok

echo Subindo o banco de dados e o armazenamento de arquivos no Docker...
docker compose up -d --wait db storage
if errorlevel 1 (
  echo Não foi possível subir os serviços. Confira se as portas 5432 e 9000 estão livres: um PostgreSQL instalado no Windows costuma ocupar a 5432.
  goto :falha
)
docker compose run --rm -T storage_init >nul
if errorlevel 1 (
  echo Não foi possível criar os buckets no armazenamento local.
  goto :falha
)

rem --- Configuração local ---
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Arquivo .env criado a partir do .env.example.
)

rem --- Dependências ---
set "INSTALAR="
if not exist "node_modules\.modules.yaml" set "INSTALAR=1"
if /i "%MODO%"=="atualizar" set "INSTALAR=1"
if not defined INSTALAR goto :deps_ok
echo Instalando as dependências. Na primeira vez leva alguns minutos...
call pnpm install --frozen-lockfile
if errorlevel 1 goto :falha
:deps_ok

rem --- Banco ---
if /i "%MODO%"=="reset" goto :banco_reset
rem Banco novo (sem a tabela de usuários): cria com o seed. Já criado: só aplica migrations novas.
rem Se a consulta falhar, para aqui: nunca recria um banco que pode ter dados.
set "TABELAS="
for /f %%n in ('docker compose exec -T db psql -U fecharota -d fecharota_dev -tAc "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'User'"') do set "TABELAS=%%n"
if "%TABELAS%"=="0" goto :banco_novo
if not "%TABELAS%"=="1" (
  echo Não foi possível consultar o banco local no Docker.
  goto :falha
)
echo Aplicando as atualizações do banco, se houver...
call pnpm db:deploy
if errorlevel 1 goto :falha
goto :banco_ok

:banco_reset
echo.
echo ATENÇÃO: isto APAGA todos os dados locais do FechaRota: cadastros, pedidos, rotas e comprovantes.
set "CONFIRMA="
set /p "CONFIRMA=Digite APAGAR para confirmar: "
if not "%CONFIRMA%"=="APAGAR" (
  echo Nada foi apagado.
  goto :sair
)
:banco_novo
echo Criando o banco de demonstração...
call pnpm db:reset
if errorlevel 1 goto :falha
:banco_ok

rem --- Build de produção ---
set "COMPILAR="
if not exist ".next\BUILD_ID" set "COMPILAR=1"
if /i "%MODO%"=="atualizar" set "COMPILAR=1"
if not defined COMPILAR goto :build_ok
echo Gerando a versão de produção do app. Leva alguns minutos...
call pnpm build
if errorlevel 1 goto :falha
:build_ok

rem --- Servidor ---
echo.
echo ============================================================
echo  FechaRota em http://localhost:3000
echo  O navegador abre sozinho quando o servidor estiver pronto.
echo  Contas de demonstração, todas com a senha fecharota123:
echo    admin@exemplo.test
echo    expedicao@exemplo.test
echo    motorista1@exemplo.test
echo  Para desligar, feche esta janela ou aperte Ctrl+C.
echo ============================================================
echo.
start "" /b powershell -NoProfile -Command "for ($i = 0; $i -lt 300; $i++) { try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri 'http://127.0.0.1:3000/api/health').StatusCode -eq 200) { Start-Process 'http://localhost:3000/'; break } } catch { }; Start-Sleep -Seconds 1 }"
rem Só nesta máquina (127.0.0.1): as contas de demonstração têm senha conhecida.
call pnpm exec next start -H 127.0.0.1 -p 3000
if errorlevel 1 goto :falha
goto :fim

:falha
echo.
echo O FechaRota não foi iniciado. Veja a mensagem acima.
:sair
echo.
pause
:fim
endlocal
