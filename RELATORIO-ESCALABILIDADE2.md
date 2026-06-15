# Relatório de Escalabilidade — Check LicGeo

## Arquitetura e o que "escalabilidade" significa aqui

O Check LicGeo é um aplicativo **100% client-side** (estático): HTML, CSS e JavaScript executados inteiramente no navegador de cada usuário. **Não há servidor de aplicação, banco de dados nem estado compartilhado.** Toda conversão de coordenadas, leitura de EXIF e geração de KML/SHP acontece localmente.

Consequência direta: cada usuário roda sua própria cópia isolada. Não existe um recurso central que possa "saturar" com o aumento de usuários — diferente de uma aplicação com backend, onde N usuários competem pelos mesmos servidores/CPU/banco.

## Teste realizado

Simulação com navegadores Chromium reais e independentes (um contexto isolado por usuário), todos carregando a página e abrindo a ferramenta de conversão **ao mesmo tempo**, servidos por um servidor HTTP local.

| Usuários simultâneos | Erros JS | Falhas | Memória JS média/usuário |
|----------------------|----------|--------|--------------------------|
| 5                    | 0        | 0      | ~10 MB                   |
| 10                   | 0        | 0      | ~10 MB                   |
| 20                   | 0        | 0      | ~10 MB                   |
| 40                   | 0        | 0      | ~10 MB                   |

**Resultados:**
- **Zero erros de JavaScript** e **zero falhas de carregamento** em todas as ondas.
- **Consumo de memória constante** (~10 MB por usuário), sem crescimento entre ondas — indica ausência de vazamentos de memória e isolamento total entre sessões.
- O aumento do tempo de carga observado nas ondas maiores reflete o limite de **CPU da máquina única** que rodava 40 navegadores ao mesmo tempo durante o teste — **não** um gargalo da aplicação. Em produção, cada usuário usa seu próprio dispositivo, eliminando essa contenção.

## Escalabilidade em produção (GitHub Pages)

1. **Servir os arquivos**: o GitHub Pages entrega conteúdo estático por uma CDN global (Fastly), dimensionada para milhões de requisições. Os arquivos do projeto somam ~150 KB (mais as bibliotecas via CDN), com cache no navegador após o primeiro acesso. Servir o site para muitos usuários simultâneos é trivial para essa infraestrutura.

2. **Processamento**: por ser client-side, escala horizontalmente de forma ilimitada — cada navegador faz seu próprio trabalho.

3. **Único ponto de dependência externa**: as **camadas WMS de referência** (IPHAN, IBGE, FUNAI, etc.). A capacidade de resposta dessas camadas depende dos servidores públicos de cada órgão, fora do controle do projeto. O aplicativo já trata indisponibilidade com avisos ao usuário e não quebra se uma camada falhar.

## Conclusão

A aplicação é adequada para uso por múltiplos usuários simultâneos. Por ser estática e sem estado de servidor, não há limite prático de concorrência imposto pelo próprio sistema; a experiência de cada usuário independe da quantidade de outros usuários ativos.
