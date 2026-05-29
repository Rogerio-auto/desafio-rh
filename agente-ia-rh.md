BRIEFING TÉCNICO
Agente de IA para
Atendimento de Dúvidas
Internas de RH
Projeto multi-tenant para três empresas-cliente
Documento de escopo e requisitos
1. Contexto
Três empresas-cliente contrataram a consultoria para desenhar e implementar um sistema baseado
em modelos de linguagem que responda dúvidas internas de seus colaboradores sobre temas de
Recursos Humanos. Cada empresa possui seu próprio acervo documental, com formatos
heterogêneos, gerados ao longo do tempo por times diferentes e sem padronização editorial.
Junto a este briefing segue uma pasta /documentos com o material disponibilizado pelas três
empresas, organizado por subpasta. O conteúdo é representativo do que se encontra em
ambientes corporativos reais: arquivos em formatos variados (PDF, DOCX, XLSX, MD, TXT), de
diferentes datas, com graus distintos de formalidade e estruturação.
As três empresas-cliente são:
• NorteVerde Logística S.A. — empresa de transporte rodoviário de cargas. Sede em Cascavel
(PR), 1.200 colaboradores.
• Construtora Aurora Engenharia Ltda. — construção civil pesada e edificações comerciais.
27 anos de mercado.
• Vitalys Saúde S.A. — operadora de saúde suplementar com clínicas próprias. Regulação
ANS.
2. Problema de Negócio
Nos três casos, o RH é o ponto de afunilamento de um volume alto de dúvidas internas repetitivas:
férias, plano de saúde, política de home office, reembolso de cursos, escala de plantão, benefícios,
conduta, segurança do trabalho. Hoje essas perguntas são tratadas por e-mail, WhatsApp ou
sistema de chamados, com tempo médio de resposta entre 6 e 48 horas, dependendo da empresa
e da carga do time. A dependência é forte em uma equipe pequena de Business Partners.
O que se quer entregar a cada uma das três empresas é um assistente conversacional capaz de
responder essas dúvidas com base nos próprios documentos da companhia. O sistema operará em
modelo compartilhado de infraestrutura — multi-tenant — atendendo as três empresas
simultaneamente. Cada empresa só pode acessar seus próprios dados; cruzamento entre tenants
não é admitido.
3. Escopo da Entrega
A entrega consiste em duas peças que precisam funcionar como um sistema integrado:
3.1 Camada de informação
Uma camada responsável por receber, processar e armazenar os documentos das três empresas
de modo que possam ser recuperados de forma relevante durante o atendimento. A estratégia, as
estruturas de dados e as ferramentas ficam a critério de quem implementa. A camada precisa lidar
com os formatos presentes em /documentos e com a heterogeneidade entre eles.
3.2 Fluxo de atendimento
Um fluxo conversacional que recebe a pergunta de um colaborador — identificado pela empresa de
origem — recupera contexto relevante na camada de informação, produz uma resposta
fundamentada nos documentos da empresa correspondente e registra a interação.
4. Requisitos Funcionais
4.1 Ingestão
• Processar os documentos da pasta /documentos em seus formatos originais.
• Associar cada documento à empresa de origem.
• Reingestão idempotente: executar o processo duas vezes não pode duplicar conteúdo.
• Suportar inclusão de um novo documento de uma das empresas sem reprocessar os demais.
4.2 Atendimento
• Receber pergunta em texto livre, em português, com identificação obrigatória da empresa do
colaborador.
• Recuperar contexto apenas a partir do acervo da empresa indicada.
• Gerar resposta em português, citando o documento de origem (nome do arquivo) quando
aplicável.
• Registrar cada interação (pergunta, resposta, documentos consultados, latência) em log
estruturado.
4.3 Isolamento entre empresas
Vazamento de dados entre as três empresas-cliente é falha crítica do sistema. Um colaborador de
uma das empresas não pode, sob nenhuma combinação de inputs, receber resposta que se baseie
em documento de outra empresa.
5. Requisitos Não-Funcionais
• Latência: resposta em até 8 segundos no P95 para perguntas factuais simples, em execução
local.
• Custo: apresentar estimativa por interação (token in + token out × preço do modelo escolhido)
e custo mensal projetado para 5.000 perguntas/mês por empresa.
• Observabilidade: log estruturado em JSON, com no mínimo os campos pergunta, empresa,
documentos_recuperados, latência_ms, custo_estimado_USD.
• Reprodutibilidade: o sistema deve subir localmente seguindo o README. Containerização é
bem-vinda, não obrigatória.
• Conformidade: tratamento adequado de dados pessoais segundo princípios da LGPD.
6. Decisões Técnicas Documentadas
Para cada decisão técnica relevante do sistema, entregar um Architecture Decision Record (ADR)
curto, no formato:
• Problema — o que precisa ser decidido.
• Contexto e restrições — o que limita o espaço de solução.
• Opções consideradas — alternativas avaliadas, com trade-offs explícitos.
• Decisão — a opção escolhida.
• Consequências aceitas — o que se ganha e o que se abre mão.
O conjunto mínimo de decisões a serem documentadas inclui: estratégia da camada de
informação, modelo de isolamento entre empresas, escolha do(s) modelo(s) de linguagem,
estratégia de recuperação de contexto e formato de logging.
7. Stack
Linguagem livre. Banco livre. Modelo de linguagem livre, contanto que custo e latência sejam
documentados. Em caso de uso de modelo executado localmente, declarar requisitos de hardware.
Frameworks de orquestração de IA podem ser utilizados a critério de quem implementa.
8. Entregáveis
Um repositório Git (público ou compartilhado) contendo, no mínimo:
seu-repositorio/
|- README.md # como rodar, decisoes macro, custo estimado
|- adr/ # Architecture Decision Records
| |- 001-camada-informacao.md
| |- 002-isolamento-multi-tenant.md
| |- 003-modelo-linguagem.md
| +- ...
|- src/ # codigo do sistema
|- tests/ # testes nos pontos criticos
|- docs/
| +- arquitetura.md # diagrama de componentes
+- logs-exemplo/ # amostra de interacoes logadas