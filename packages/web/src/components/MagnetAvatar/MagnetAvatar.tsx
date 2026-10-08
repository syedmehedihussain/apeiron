import m16 from '../../assets/magnet/magnet-16.svg';
import m24 from '../../assets/magnet/magnet-24.svg';
import m48 from '../../assets/magnet/magnet-48.svg';
import m96 from '../../assets/magnet/magnet-96.svg';

const SRC = { 16: m16, 24: m24, 48: m48, 96: m96 } as const;

/** Magnet, drawn at one of the four designed sizes. `display` scales the image. */
export function MagnetAvatar({ size, display }: { size: 16 | 24 | 48 | 96; display?: number }) {
  const px = display ?? size;
  return <img src={SRC[size]} width={px} height={px} alt="" aria-hidden="true" />;
}
