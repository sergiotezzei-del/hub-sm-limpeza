# Decisão de Produto — Descontinuação do Mapa Mestre

## Status

**Descontinuado como função operacional.**

O Mapa Mestre não deve aparecer no Painel Tezzei, não deve ser oferecido aos usuários e não deve receber novas funcionalidades.

## Motivo

A função repetia a navegação já existente no HUB SM, exigia manutenção paralela a cada mudança do aplicativo e não gerava ganho operacional mensurável para pedidos, estoque, limpeza, segurança, manutenção ou demais setores.

## Decisão técnica

- Ocultar o card do Painel Tezzei.
- Redirecionar sessões e URLs antigas para o painel administrativo.
- Preservar temporariamente os componentes, migrations e dados existentes.
- Não apagar tabelas nem histórico nesta etapa.
- Não criar novas telas, ações ou conexões do Mapa Mestre.

## Regra para futuras funcionalidades

Uma nova função operacional só deve ser priorizada quando reduzir tempo, erro ou risco; produzir controle ou alerta útil; ou melhorar uma decisão real do usuário.

Organização visual isolada, sem ação operacional associada, não justifica um novo módulo.

## Possível reavaliação

A função somente deve ser reavaliada se existir um caso de uso concreto, com usuário definido, ação necessária e resultado mensurável. Até lá, permanece arquivada tecnicamente.
