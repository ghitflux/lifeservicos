import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header, MobileNav } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';

const CONTACT_EMAIL = 'appcontato@lifedigital.cloud';

function openMail() {
  Linking.openURL(`mailto:${CONTACT_EMAIL}`);
}

export default function Politicas() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Políticas" showBackButton />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Política de Privacidade do App Life</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Última atualização: 17/12/2025</Text>

          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Esta Política de Privacidade explica como o app Life e seus serviços relacionados tratam dados pessoais,
            conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>1) Quem é o responsável pelos dados (Controlador)</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            O controlador dos dados pessoais é LIFEBANK INSTITUICAO DE PAGAMENTOS LTDA, CNPJ 55.098.945/0001-80, com
            endereço em R Rui Barbosa, 68, Sala 417, Centro, Teresina, PI, CEP 64.000-090.
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>LIFE BANCK</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>LIFE BANCK</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Contato (único canal): {CONTACT_EMAIL}</Text>

          <Text style={[styles.heading, { color: colors.text }]}>2) O que o app faz</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            O Life é um app de solicitação e acompanhamento de análises e simulações relacionadas a:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • consulta de margem e disponibilidade para modalidades de empréstimo
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • verificação de possibilidade de negociação e quitação de dívidas bancárias
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • consulta de disponibilidade de saldo/liberação, quando aplicável à análise
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Importante: o app não realiza transações financeiras dentro do aplicativo (não há pagamento, transferência,
            contratação ou movimentação de valores no app). Ele serve para enviar documentos, abrir solicitações e
            acompanhar o andamento.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>3) Quais dados coletamos</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Conforme o uso do app, podemos tratar:</Text>

          <Text style={[styles.subheading, { color: colors.text }]}>a) Dados de cadastro e contato</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • nome, e-mail, telefone e outros dados informados por você no cadastro
          </Text>

          <Text style={[styles.subheading, { color: colors.text }]}>b) Documentos e anexos enviados</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • fotos e arquivos anexados (documentos pessoais, comprovantes e outros que você enviar para permitir a
            análise da solicitação)
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Esses anexos podem conter dados pessoais e, dependendo do documento, até dados considerados sensíveis pela
            LGPD. Por isso, tratamos com controles reforçados e acesso restrito.
          </Text>

          <Text style={[styles.subheading, { color: colors.text }]}>c) Dados técnicos e de segurança</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • informações de dispositivo e registros técnicos (ex.: IP, data/hora de acesso, eventos de funcionamento)
            para segurança, auditoria e estabilidade do serviço
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>4) Para que usamos seus dados</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Usamos os dados para:</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• criar e manter sua conta no app</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • receber, validar e processar sua solicitação (incluindo conferência de documentos)
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • realizar consultas e análises somente para a finalidade autorizada por você: avaliar margem, viabilidade
            de negociação/quitação e disponibilidade de saldo/liberação
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • atualizar o status e o histórico da solicitação dentro do app
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • entrar em contato quando necessário (ex.: pendências, documentos adicionais, retorno da análise)
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • prevenção a fraudes, segurança, auditoria e melhoria do serviço
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • cumprimento de obrigações legais e regulatórias, quando aplicável
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>5) Bases legais (LGPD)</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Dependendo do caso, tratamos dados com base em:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • consentimento (principalmente para envio de documentos e autorização de consulta para a finalidade
            solicitada)
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • execução de procedimentos preliminares e/ou contrato (para operar a solicitação e o acompanhamento)
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • cumprimento de obrigação legal/regulatória, quando aplicável
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • legítimo interesse (ex.: segurança, prevenção a fraudes, estabilidade do app), sempre com medidas de
            minimização e respeito aos seus direitos
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>6) Com quem compartilhamos seus dados</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Nós não vendemos seus dados.</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Podemos compartilhar dados somente quando necessário para atender sua solicitação e operar o serviço, por
            exemplo:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • provedores de infraestrutura (hospedagem, armazenamento, monitoramento e suporte)
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • parceiros envolvidos na análise e consulta relacionada à solicitação (ex.: para checagem de margem,
            viabilidade de negociação, retorno de disponibilidade), sempre limitado ao necessário e à finalidade
            autorizada por você
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • autoridades públicas, mediante obrigação legal ou ordem válida
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>7) Segurança da informação</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• criptografia em trânsito (HTTPS/TLS)</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• controle de acesso e rastreabilidade</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• acesso restrito aos documentos enviados</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• monitoramento e medidas de prevenção a fraude</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Nenhum sistema é invulnerável, mas buscamos reduzir riscos de forma contínua.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>8) Por quanto tempo guardamos os dados</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Guardamos dados pelo tempo necessário para:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• processar e acompanhar sua solicitação</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • cumprir obrigações legais/regulatórias, quando existirem
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • exercer direitos e manter registros de segurança/auditoria
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Quando possível e aplicável, os dados podem ser excluídos, anonimizados ou bloqueados.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>9) Seus direitos</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Você pode solicitar, a qualquer momento:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• acesso, correção e atualização</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• informação sobre uso e compartilhamento</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • revogação de consentimento (quando aplicável)
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • exclusão de conta e dados, conforme esta Política e a Política de Exclusão
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Contato (único canal): {CONTACT_EMAIL}</Text>

          <Text style={[styles.heading, { color: colors.text }]}>10) Exclusão de conta</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Você pode excluir sua conta a qualquer momento pelo próprio app. Veja a Política de Exclusão de Conta e
            Dados abaixo.
          </Text>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.title, { color: colors.text }]}>Termos de Uso do App Life</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Última atualização: 17/12/2025</Text>

          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Ao usar o app Life, você concorda com estes Termos.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>1) Finalidade do app</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            O app permite enviar documentos e informações para solicitar simulações/consultas e acompanhar o andamento
            do pedido.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>2) Sem transações dentro do app</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            O app não realiza transações financeiras. A abertura de solicitação não garante aprovação, liberação,
            renegociação ou qualquer resultado específico.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>3) Responsabilidades do usuário</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Você se compromete a:</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>• fornecer informações verdadeiras e atualizadas</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • enviar documentos legítimos e relacionados à sua solicitação
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • não usar o app para fraude, falsificação, engenharia social ou qualquer finalidade ilegal
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>4) Disponibilidade e alterações</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Podemos atualizar e ajustar o app para melhorias, segurança e manutenção, inclusive com indisponibilidades
            temporárias.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>5) Suporte e contato</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Contato (único canal): {CONTACT_EMAIL}</Text>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.title, { color: colors.text }]}>Política de Exclusão de Conta e Dados do App Life</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Última atualização: 17/12/2025</Text>

          <Text style={[styles.heading, { color: colors.text }]}>1) Como excluir a conta</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Você pode excluir sua conta a qualquer momento pelo próprio app, no caminho de configurações da conta.
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Se você não conseguir acessar o app, pode solicitar a exclusão pelo e-mail: {CONTACT_EMAIL}
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            No pedido, informe dados mínimos para localizar sua conta (ex.: e-mail/telefone do cadastro) e poderemos
            solicitar confirmação de identidade para evitar exclusões indevidas.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>2) O que acontece quando você exclui</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Ao excluir a conta:</Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • sua conta é desativada e o processo de exclusão é iniciado
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • seus dados pessoais associados ao perfil e às solicitações podem ser excluídos e/ou anonimizados, quando
            aplicável
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • solicitações em andamento podem ser encerradas, ou mantidas somente se necessário por motivo legal/segurança
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>3) O que pode ser mantido mesmo após a exclusão</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Alguns registros mínimos podem ser retidos quando necessário para:
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • cumprir obrigações legais/regulatórias
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • prevenir fraudes e garantir segurança
          </Text>
          <Text style={[styles.bullet, { color: colors.textSecondary }]}>
            • resguardar direitos em processos administrativos/judiciais
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Nesses casos, o acesso é restrito e a retenção ocorre apenas pelo tempo necessário.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>4) Confirmação</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Quando aplicável, enviaremos uma confirmação para o contato associado à conta.
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>Contato (único canal): {CONTACT_EMAIL}</Text>

          <Pressable
            style={[styles.contactButton, { backgroundColor: colors.cardSecondary, borderColor: colors.border }]}
            onPress={openMail}
          >
            <Ionicons name="mail-outline" size={20} color={colors.accent} />
            <Text style={[styles.contactButtonText, { color: colors.text }]}>Enviar e-mail para {CONTACT_EMAIL}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <MobileNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  card: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
  },
  heading: {
    marginTop: spacing.lg,
    fontSize: 14,
    fontWeight: '700',
  },
  subheading: {
    marginTop: spacing.md,
    fontSize: 13,
    fontWeight: '700',
  },
  paragraph: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 18,
  },
  bullet: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xl,
  },
  contactButton: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactButtonText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});

