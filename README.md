# Painel Clínica Dra. Roseane Débora

Site em Next.js para transformar a planilha de metas da clínica em um painel com acesso individual por profissional.

## O que o site faz

- Login individual para cada profissional.
- Painel da profissional em `/painel`, mostrando somente os próprios resultados.
- Painel administrativo em `/admin`, com visão geral de todas as profissionais.
- Tela administrativa em `/admin/editar` para atualizar metas, realizado mensal e comissão de avaliações.
- Regras de segurança no Supabase para impedir que uma profissional leia dados de outra.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

O arquivo `.env.local` está em modo demonstração:

```env
NEXT_PUBLIC_DEMO_MODE=true
```

Nesse modo, use qualquer senha e entre com estes e-mails:

| Perfil | E-mail |
| --- | --- |
| Admin | admin@clinica.com |
| Erica | erica@clinica.com |
| Gilmara | gilmara@clinica.com |
| Kelly | kelly@clinica.com |
| Maria | maria@clinica.com |
| Tayane | tayane@clinica.com |

## Publicar com Supabase

1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Crie os usuários em Authentication > Users.
4. Ajuste os perfis conforme `supabase/usuarios.sql`.
5. Execute `supabase/importar_dados_planilha.sql` para carregar os dados extraídos da planilha.
6. Configure `.env.local` com as chaves reais e desligue o modo demo:

```env
NEXT_PUBLIC_SUPABASE_URL=SUA_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
NEXT_PUBLIC_DEMO_MODE=false
```

## Hospedar no GitHub Pages

O projeto já contém o workflow:

`/.github/workflows/deploy.yml`

Depois que o código estiver em um repositório do GitHub:

1. Abra o repositório no GitHub.
2. Vá em Settings > Pages.
3. Em Build and deployment, selecione Source: GitHub Actions.
4. Faça push na branch `master` ou `main`.
5. Aguarde o workflow `Deploy GitHub Pages` finalizar.

O site será publicado em:

`https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/`

Para publicar com dados reais, cadastre estas variáveis no GitHub em Settings > Secrets and variables > Actions > Variables:

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon do Supabase |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |

Para troca de senha real funcionar, o site precisa estar com `NEXT_PUBLIC_DEMO_MODE=false` e as chaves reais do Supabase. Em modo demonstração a senha não é alterada no banco.

## Dados importados

Os dados de metas e resultados foram extraídos de:

`D:\Metas_Clinica\painel_clinica_dra_roseane_v6.xlsx`

Abas usadas:

- `METAS MÊS`: metas mensais, gatilho e meta máxima.
- `BASE`: realizado mensal por profissional.
- `AVALIAÇÕES`: comissão de avaliações, atualmente zerada na planilha.
