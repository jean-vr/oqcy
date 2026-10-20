# oqcy — Open QCY

[English](README.md) · **Português (BR)**

Aplicativo **aberto e não oficial** para controlar fones **QCY** por Bluetooth, feito com Expo + TypeScript.
Ele conversa direto com o fone (BLE/GATT) para mostrar a bateria e ajustar controle de ruído, equalizador,
botões e outras configurações, sem conta, sem nuvem e sem anúncios.

> **Status: experimental.** Foi desenvolvido e testado em um único aparelho, o **QCY HT05 ANC**, num Android.
> Outros modelos QCY que usam o mesmo protocolo podem funcionar parcialmente, mas **nada foi validado neles**.
> Veja [Compatibilidade](#compatibilidade) e [Como ajudar com outros modelos](#como-ajudar-com-outros-modelos).

*Sem afiliação com a QCY.*

## Por que existe

O app oficial da QCY funciona, mas tem problemas de conexão conhecidos: às vezes demora a conectar, às vezes não
reconhece o fone que o sistema já conectou, e o status do fone sincroniza devagar ou trava. O oqcy reimplementa só a
parte de Bluetooth/configuração, com uma arquitetura pensada para ser rápida e previsível, e documenta o protocolo
para que outras pessoas possam estendê-lo.

## O que funciona (no HT05 ANC)

- Conexão automática e reconexão ao tirar o fone do estojo.
- Bateria do lado esquerdo, direito e do estojo.
- Controle de ruído: **Cancelamento**, **Desligado**, **Ambiente** e os cenários do ANC (Interior, Viagens diárias, Barulho, Ruído contra o vento).
- **Meus efeitos sonoros**: presets de equalizador (Predefinido, Popular, Bass pesados, Rock, Suave).
- Volume do fone, modo jogo, detecção de uso, LED, modo sono.
- Mapeamento dos botões, nome do fone, desligamento automático, balanço, versão de firmware.
- Tela de **Diagnóstico**: log de tudo que é enviado/recebido, sondas para descobrir comandos e envio de bytes crus.

Os controles **só aparecem se o fone responder ao comando correspondente**, então modelos diferentes mostram telas diferentes.

## Compatibilidade

| Item | Situação |
| --- | --- |
| Android | Sim (precisa de *development build*; BLE é código nativo e não roda no Expo Go) |
| iOS | Não testado. O módulo de Bluetooth clássico é só Android |
| Web | Roda contra um **fone simulado**, só para ver a interface |
| QCY HT05 ANC | Testado |
| Outros QCY | Não testados. Valores de comandos (principalmente ruído e presets de EQ) **variam por modelo** |
| Fones com outros chips/protocolos | Fora do escopo (ver [Limites](#limites)) |

## Instalação e uso

Requisitos: Node.js 24+ (≥ 24.11), JDK 17 e Android SDK para compilar.

```bash
npm install
npm test                  # protocolo + gerenciador de conexão contra um fone simulado
npx expo start --web      # interface contra o fone simulado, sem Bluetooth
npx expo run:android      # build de desenvolvimento no aparelho (precisa do Metro)
```

APK de release, com o JavaScript embutido (não depende do Metro):

```bash
npx expo prebuild --platform android
cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
# saída: android/app/build/outputs/apk/release/app-release.apk
```

Antes de abrir o app, **pareie o fone nas configurações de Bluetooth do Android** (o áudio usa o Bluetooth do
sistema; o oqcy cuida só dos ajustes) e conceda as permissões de Bluetooth quando o app pedir.

> Uma build de debug precisa do servidor Metro. Sem ele, o app fica preso na tela de abertura
> (`Unable to load script`). Use a build de release ou rode `adb reverse tcp:8081 tcp:8081` com `npx expo start`.

## Arquitetura

```
src/protocol/   puro, sem React Native: enquadramento TLV, codecs, parser de anúncio BLE, valores de ruído, presets de EQ  (testado)
src/transport/  interface Radio/Link; implementação com react-native-ble-plx e um fone simulado (web/testes)
src/session/    EarbudSession (GATT, fila, ações otimistas) e ConnectionManager (máquina de estados)                       (testado)
src/classic/    wrapper do módulo nativo Android (modules/oqcy-classic, Kotlin): eventos de Bluetooth clássico
src/app/        telas (expo-router)
tests/          vetores de teste com bytes reais capturados do app oficial
```

### Como a conexão funciona

- **Corrida de conexão:** o app tenta o último endereço BLE salvo **e** varre em modo de baixa latência filtrando
  pelo MAC clássico do anúncio. Vence quem sincronizar primeiro. Falhas usam backoff exponencial com jitter.
- **Bluetooth clássico como gatilho:** o módulo Kotlin repassa eventos `ACL/A2DP/HFP`. Fone conectou ao celular →
  conecta o GATT na hora. Fone saiu/foi pro estojo → derruba a sessão sem esperar o timeout.
- **Estado:** um instantâneo vem numa leitura só; depois o app pede só o que faltou. Ações são *otimistas* (a UI
  muda na hora) e relêem o valor real se o fone não confirmar. Um watchdog detecta conexões "meio mortas".

### O protocolo QCY (GATT, serviço `0000A001-…`)

| Característica | Uso |
| --- | --- |
| `1001` | escrita de comandos, sem resposta: `FF <len> (<cmd> <len> <dados>)…` |
| `1002` | notificação/leitura do estado, mesmo enquadramento (vários TLVs por quadro) |
| `0008` | bateria `[E, D, estojo]`, bit 7 = carregando |
| `0007` | versão de firmware E/D |
| `000D` | botões, pares `[tecla, função]`, sem enquadramento |
| `000B` | equalizador legado: `[índice, 10 ganhos int8]`, sem enquadramento |

Pedir um estado: `FF 03 FE 01 <cmd>`. Os IDs de comando estão em [`src/protocol/constants.ts`](src/protocol/constants.ts).

O **anúncio BLE** (company ID `0x521C`/`0x522C`) já traz modelo, bateria e o MAC do Bluetooth clássico
([`src/protocol/advert.ts`](src/protocol/advert.ts)), o que liga o fone pareado no Android ao endereço BLE dele.

### Valores do QCY HT05 ANC

Controle de ruído (comando 12, `FF 03 0C 01 <valor>`):

| Valor | Efeito |
| --- | --- |
| `0x02` | ANC desligado |
| `0x63` | ANC ligado |
| `0xA4` | Ambiente (passthrough) |
| `0x41` `0x51` `0x61` `0x71` | cenários do ANC: Interior, Viagens diárias, Barulho, Ruído contra o vento (ordem inferida da tela do app oficial) |

Presets de EQ (característica `000B`): ver [`src/protocol/presets.ts`](src/protocol/presets.ts).
O preset "Clássico" ainda não foi capturado.

Como esses valores foram obtidos: capturas HCI do app oficial usando o **próprio** fone do autor, confirmadas ouvindo
o fone. Nada disso vem de código ou assets da QCY: o repositório contém apenas bytes de protocolo e código novo.

## Como ajudar com outros modelos

O app tem ferramentas de diagnóstico para mapear modelos novos sem recompilar:

1. Em **Diagnóstico**, rode **Descobrir comandos** (lista os IDs que o fone responde) e use **Compartilhar log**
   (mostra o modelo, as características GATT e cada pacote enviado/recebido).
2. Para achar valores que não dá para adivinhar (ruído, presets), capture o tráfego do app oficial:
   ative *Opções do desenvolvedor → Ativar registro de HCI snoop do Bluetooth*, desligue/ligue o Bluetooth,
   use o app oficial trocando **um** ajuste por vez com pausas, anote a ordem e extraia o `btsnoop_hci.log`
   (`adb bugreport`). Os pacotes ATT escritos em `0x1001`/`0x000B` mostram os bytes exatos.
3. Abra uma *issue* ou PR com o modelo, a lista do que você fez e os bytes. Se possível, acrescente um teste em
   `tests/` com os bytes capturados.

## Limites

- Só a família de protocolo **QCY sobre GATT `A001`**. O app oficial também fala outros protocolos (Jieli RCSP,
  Airoha, Realtek, Actions, SPP…) e faz atualização de firmware (OTA). Isso **não** está aqui.
- Sem serviço em segundo plano: reconecta com o app aberto ou ao voltar ao primeiro plano.
- O EQ de presets não permite edição banda a banda (as frequências das 10 bandas não são conhecidas).
- Alguns rótulos e unidades (como o desligamento automático) vêm de constantes do app oficial e podem variar por modelo.
- **Use por sua conta e risco.** Enviar comandos desconhecidos a um fone pode mudar configurações dele. Reset de
  fábrica e limpeza de pareamento estão disponíveis, com confirmação, na tela de ajustes.

## Aviso legal

O oqcy é um projeto independente, **sem afiliação, aprovação ou apoio da QCY**. "QCY" e nomes de produtos são marcas
dos seus respectivos donos, usadas apenas para indicar compatibilidade. O protocolo foi levantado por observação do
tráfego do próprio fone do autor e análise do app oficial, **para fins de interoperabilidade** com um dispositivo de
sua propriedade. O repositório não inclui código, imagens ou dados do app oficial. Se você é titular de direitos e
tem alguma objeção, abra uma issue.

## Licença

MIT, veja [`LICENSE`](LICENSE).
