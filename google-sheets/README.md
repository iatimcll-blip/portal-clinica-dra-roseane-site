# Espelho Google Sheets

Este espelho registra automaticamente:

- acessos ao portal;
- confirmações do botão "Li e estou ciente".

O Supabase continua sendo a fonte principal. O Google Sheets recebe apenas uma cópia para consulta.

## Como ativar

1. Crie uma planilha no Google Sheets.
2. Abra `Extensões > Apps Script`.
3. Cole o conteúdo de `google-sheets/apps-script-webhook.gs`.
4. Clique em `Implantar > Nova implantação`.
5. Escolha o tipo `App da Web`.
6. Configure:
   - Executar como: `Eu`
   - Quem pode acessar: `Qualquer pessoa`
7. Copie a URL terminada em `/exec`.
8. No GitHub, vá em `Settings > Secrets and variables > Actions > Variables`.
9. Crie a variável:
   - Nome: `NEXT_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL`
   - Valor: a URL `/exec` do Apps Script.
10. Publique novamente o site.

As abas `Acessos` e `Leituras de Materiais` serão criadas automaticamente no primeiro evento recebido.
