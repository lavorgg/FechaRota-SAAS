-- E-mail de usuário é único em todo o sistema (seção 3.6) e o login compara exatamente.
-- O app grava sempre em minúsculas e sem espaços nas pontas; o banco garante isso, para que
-- "Ana@x.com" e "ana@x.com" nunca virem duas contas.
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized_check" CHECK ("email" = lower(btrim("email")));
