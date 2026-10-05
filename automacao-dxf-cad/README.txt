# SAR - Automação DXF/CAD

## Estrutura

automacao-dxf-cad/
├── index.html
├── css/
│   └── automacao-dxf-cad.css
└── js/
    └── automacao-dxf-cad.js

## Como subir

Copie a pasta `automacao-dxf-cad` inteira para o repositório do frontend do SAR.

A rota ficará, em uma estrutura estática comum:

/automacao-dxf-cad/

ou

/automacao-dxf-cad/index.html

## O que esta V1 faz

- Página central própria do módulo.
- Menu superior interno.
- Tela inicial "Automação DXF/CAD — Selecione uma automação acima".
- Croqui → DXF ativo.
- Upload local JPG, PNG e PDF.
- Pré-visualização de JPG/PNG no navegador.
- Campo de medida de referência.
- Validação visual do formulário.
- Estrutura preparada para backend.

## O que esta V1 NÃO faz

- Não chama Railway.
- Não gera DXF real.
- Não altera outros módulos do SAR.
- Não contém regras técnicas protegidas.
- Não depende de bibliotecas externas.

## Integração futura

Endpoints previstos:

POST /api/automacao-dxf-cad/analisar
POST /api/automacao-dxf-cad/gerar-dxf

O JavaScript já está separado para facilitar a conexão posterior.
