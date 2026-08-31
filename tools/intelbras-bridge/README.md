# Agente local Intelbras AMT 8000 LITE

Baseado no SDK/API oficial entregue pela Intelbras em 31/08/2026.

## Objetivo desta fase

Validar a comunicação LAN com a central **sem alterar o estado do alarme**.

O probe atual faz somente:

1. abre TCP com a central;
2. autentica usando `AUTENTICA_CONEXAO_REMOTA` (`F0F0`);
3. mantém a sessão com `KEEP_ALIVE` (`F0F7`);
4. aguarda o status completo `STATUS_COMPLETO_CENTRAL_ALARME` (`0B4A`);
5. decodifica partições e zonas e imprime apenas dados operacionais sanitizados;
6. encerra a conexão.

O probe **não implementa** os comandos `401E` (arme/desarme) nem `401F` (bypass) no caminho executável.

## Central Santa Maria

- Modelo: AMT 8000 LITE
- IP local observado: `192.168.1.100`
- Porta TCP do acesso direto: `9009`
- Até 16 partições
- Até 64 zonas

## Windows — forma recomendada

Em um computador conectado à rede local da Santa Maria, com Node.js instalado:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-readonly-windows.ps1
```

O script pede a **senha de acesso remoto de 6 dígitos** em modo oculto. Ela fica apenas na memória do processo e é removida ao terminar.

Nunca:

- salve a senha no GitHub;
- cole a senha em chat;
- coloque a senha em código fonte;
- use senha Master/Instalador quando o protocolo pedir especificamente a senha de acesso remoto.

## Execução manual

Também é possível usar variáveis de ambiente:

```powershell
$env:INTELBRAS_REMOTE_PASSWORD="******"
node .\tools\intelbras-bridge\probe.mjs
Remove-Item Env:INTELBRAS_REMOTE_PASSWORD
```

A forma acima pode deixar a senha no histórico do terminal; por isso prefira `run-readonly-windows.ps1`.

## Testes locais sem central

```bash
node --test tools/intelbras-bridge/*.test.mjs
```

Os testes cobrem checksum, montagem de quadros, fragmentação TCP e interpretação do status 0B4A usando dados sintéticos.

## Próximas etapas após o primeiro teste real

Somente depois de confirmar TCP + autenticação + leitura 0B4A:

1. manter um agente local persistente;
2. sincronizar snapshot sanitizado com o HUB/Supabase;
3. receber eventos e criar alertas/push;
4. implementar fila auditada de comandos;
5. liberar `401E` primeiro para arme, depois desarme;
6. liberar `401F` para bypass somente após validação adicional.

Comandos de alteração devem permanecer desativados por padrão e sempre exigir autorização de Admin + confirmação + auditoria.
