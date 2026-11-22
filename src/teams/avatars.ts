import Phaser from 'phaser';
import type { Fighter } from './contracts';
const hash = (value: string) =>
  [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

/** Original illustrated profile stand-ins, replaced by real provider avatars when supplied. */
export function avatar(scene: Phaser.Scene, fighter: Fighter): string {
  const key = `profile-${fighter.ownerId}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 80, 80)!;
  const c = texture.context,
    seed = hash(fighter.ownerId);
  c.save();
  c.beginPath();
  c.arc(40, 40, 40, 0, Math.PI * 2);
  c.clip();
  const hue = seed % 360;
  const background = c.createLinearGradient(0, 0, 80, 80);
  background.addColorStop(0, `hsl(${hue} 60% 65%)`);
  background.addColorStop(1, `hsl(${(hue + 35) % 360} 55% 24%)`);
  c.fillStyle = background;
  c.fillRect(0, 0, 80, 80);
  if (seed % 4 === 0) {
    c.fillStyle = `hsl(${hue} 42% 23%)`;
    c.beginPath();
    c.moveTo(15, 40);
    c.lineTo(12, 9);
    c.lineTo(31, 23);
    c.quadraticCurveTo(40, 16, 49, 23);
    c.lineTo(68, 9);
    c.lineTo(65, 47);
    c.quadraticCurveTo(58, 73, 40, 74);
    c.quadraticCurveTo(13, 70, 15, 40);
    c.fill();
    for (const x of [27, 53]) {
      c.fillStyle = '#f6e7b9';
      c.beginPath();
      c.ellipse(x, 41, 11, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#12273b';
      c.beginPath();
      c.ellipse(x + 2, 41, 4, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#efad6f';
    c.beginPath();
    c.moveTo(34, 56);
    c.lineTo(46, 56);
    c.lineTo(40, 62);
    c.fill();
  } else {
    const skin = ['#ffd8af', '#d99c7a', '#965f50', '#f1be8f'][seed % 4];
    c.fillStyle = `hsl(${(hue + 160) % 360} 61% 37%)`;
    c.beginPath();
    c.ellipse(40, 87, 34, 29, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = skin;
    c.fillRect(33, 51, 14, 16);
    c.beginPath();
    c.ellipse(40, 37, 23, 29, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = ['#27243c', '#724f3b', '#e5bc79', '#352b2d'][seed % 4];
    c.beginPath();
    c.moveTo(16, 35);
    c.quadraticCurveTo(8, 3, 39, 7);
    c.quadraticCurveTo(72, 3, 64, 37);
    c.lineTo(55, 27);
    c.lineTo(51, 14);
    c.quadraticCurveTo(36, 32, 18, 26);
    c.fill();
    c.fillStyle = '#253347';
    for (const x of [31, 49]) {
      c.beginPath();
      c.ellipse(x, 39, 2.8, 4, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#995e54';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(40, 49, 7, 0.2, Math.PI - 0.2);
    c.stroke();
    if (seed % 5 === 0) {
      c.strokeStyle = '#f0da9d';
      c.lineWidth = 3;
      c.strokeRect(21, 33, 15, 12);
      c.strokeRect(44, 33, 15, 12);
      c.beginPath();
      c.moveTo(36, 38);
      c.lineTo(44, 38);
      c.stroke();
    }
  }
  c.restore();
  texture.refresh();
  if (fighter.avatar) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (!scene.sys.isActive()) return;
      const size = Math.min(image.width, image.height);
      c.save();
      c.beginPath();
      c.arc(40, 40, 40, 0, 2 * Math.PI);
      c.clip();
      c.clearRect(0, 0, 80, 80);
      c.drawImage(
        image,
        (image.width - size) / 2,
        (image.height - size) / 2,
        size,
        size,
        0,
        0,
        80,
        80,
      );
      c.restore();
      texture.refresh();
    };
    image.src = fighter.avatar;
  }
  return key;
}
