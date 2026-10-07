/**
 * Bipe curto quando o ponto entra (06/10/2026, modo galpão — decisão 14 do plano do tablet sem
 * toque): quem está a um passo do tablet ouve que deu certo sem precisar ler a tela.
 *
 * O som é gerado na hora (Web Audio), sem arquivo pra baixar. O navegador só toca som depois de
 * algum toque na página OU com o site instalado como app (o tablet usa o app "Ponto"): se ele não
 * deixar, o bipe não sai e fica um aviso no console — o ponto NUNCA depende do bipe.
 */
let contexto: AudioContext | null = null;

export function tocarBipe(): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    contexto ??= new AudioContext();
    const ctx = contexto;
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err: unknown) => console.warn('Bipe: o navegador não deixou tocar som agora.', err));
    }
    const oscilador = ctx.createOscillator();
    const volume = ctx.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.value = 880;
    const inicio = ctx.currentTime;
    volume.gain.setValueAtTime(0.0001, inicio);
    volume.gain.exponentialRampToValueAtTime(0.4, inicio + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
    oscilador.connect(volume);
    volume.connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.2);
  } catch (err) {
    console.warn('Bipe: não foi possível tocar o som.', err);
  }
}
