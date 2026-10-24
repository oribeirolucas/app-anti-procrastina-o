import { useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import { Botao, Campo, Erro } from "../components/ui";

export default function Login() {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const login = trpc.auth.login.useMutation({ onSuccess: () => utils.auth.eu.invalidate() });
  const enviar = (e: FormEvent) => { e.preventDefault(); login.mutate({ email, senha }); };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Recepção IA</h1>
          <p className="text-sm text-slate-500">Entre com seu e-mail e senha.</p>
        </div>
        <Campo rotulo="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Erro erro={login.error} />
        <Botao type="submit" className="w-full" carregando={login.isPending}>Entrar</Botao>
      </form>
    </div>
  );
}
