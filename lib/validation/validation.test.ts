import { describe, expect, it } from "vitest";

import { loginSchema, signupSchema } from "./auth";
import { emailSchema, optionalCnpjSchema, optionalPhoneSchema } from "./common";
import { createUserSchema, listUsersSchema, updateUserSchema } from "./users";

describe("e-mail", () => {
  it("normaliza para minúsculas e sem espaços", () => {
    expect(emailSchema.parse("  Ana.Silva@Exemplo.TEST ")).toBe("ana.silva@exemplo.test");
  });

  it.each(["", "ana", "ana@", "@exemplo.test", "ana silva@exemplo.test"])("recusa %j", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe("telefone e CNPJ opcionais", () => {
  it("vazio vira null; preenchido é normalizado", () => {
    expect(optionalPhoneSchema.parse("")).toBeNull();
    expect(optionalPhoneSchema.parse(undefined)).toBeNull();
    expect(optionalPhoneSchema.parse("(16) 99999-0001")).toBe("5516999990001");
    expect(optionalPhoneSchema.safeParse("123").success).toBe(false);
    expect(optionalCnpjSchema.parse("  ")).toBeNull();
    expect(optionalCnpjSchema.parse("11.222.333/0001-81")).toBe("11222333000181");
    expect(optionalCnpjSchema.safeParse("11.222.333/0001-82").success).toBe(false);
    // CPF válido não serve como CNPJ da empresa.
    expect(optionalCnpjSchema.safeParse("529.982.247-25").success).toBe(false);
  });
});

describe("login", () => {
  it("normaliza o e-mail e exige senha", () => {
    expect(loginSchema.parse({ email: " ADMIN@exemplo.test", password: "x" })).toMatchObject({ email: "admin@exemplo.test" });
    expect(loginSchema.safeParse({ email: "admin@exemplo.test", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "admin@exemplo.test", password: "á".repeat(37) }).success).toBe(false);
  });
});

describe("cadastro de empresa", () => {
  const valid = {
    companyName: "Distribuidora Nova",
    cnpj: "",
    timezone: "America/Sao_Paulo",
    adminName: "Ana",
    email: "ana@nova.test",
    password: "senha-forte",
    passwordConfirmation: "senha-forte",
  };

  it("aceita os dados mínimos", () => {
    expect(signupSchema.parse(valid)).toMatchObject({ cnpj: null, timezone: "America/Sao_Paulo" });
  });

  it("exige senhas iguais, com o erro no campo de confirmação", () => {
    const result = signupSchema.safeParse({ ...valid, passwordConfirmation: "outra-senha" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["passwordConfirmation"]);
  });

  it("recusa senha curta e fuso fora da lista", () => {
    expect(signupSchema.safeParse({ ...valid, password: "1234567", passwordConfirmation: "1234567" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, timezone: "Europe/Lisbon" }).success).toBe(false);
  });
});

describe("usuários", () => {
  it("criar exige papel válido e senha de 8 caracteres", () => {
    const base = { name: "Rui", email: "rui@x.test", role: "MOTORISTA", password: "12345678" };
    expect(createUserSchema.parse(base)).toMatchObject({ phone: null, role: "MOTORISTA" });
    expect(createUserSchema.safeParse({ ...base, role: "SUPERUSUARIO" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "1234567" }).success).toBe(false);
  });

  it("editar não aceita senha", () => {
    const parsed = updateUserSchema.parse({ id: "u1", name: "Rui", email: "rui@x.test", role: "ADMIN", password: "ignorada" });
    expect(parsed).not.toHaveProperty("password");
  });

  it("listagem: página inválida vira 1", () => {
    expect(listUsersSchema.parse({ page: "abc" }).page).toBe(1);
    expect(listUsersSchema.parse({ page: "-3" }).page).toBe(1);
    expect(listUsersSchema.parse({ page: "2", q: "  " })).toEqual({ page: 2, q: undefined });
  });
});
