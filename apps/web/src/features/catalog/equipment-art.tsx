import { Camera, Lightbulb, Package, Triangle } from 'lucide-react';
import { useState } from 'react';
import { type Equipment } from './catalog-query';

export function imageUrl(id: number) {
  return `/api/v1/catalog/images/${id}`;
}

export function EquipmentArt({ equipment }: { equipment: Equipment }) {
  const cover = equipment.images?.[0];
  if (cover) {
    return (
      <div className="equipment-art equipment-photo">
        <img src={imageUrl(cover.id)} alt={equipment.name} loading="lazy" />
      </div>
    );
  }

  const words = `${equipment.name} ${equipment.description}`.toLowerCase();
  let visual = { label: 'Equipment', tone: 'neutral', icon: Package };

  if (/\b(tripod|monopod|rig|mount|stand|stabilizer)\b/.test(words)) {
    visual = { label: 'Support gear', tone: 'support', icon: Triangle };
  } else if (/\b(light|lighting|led|fixture|softbox|strobe)\b/.test(words)) {
    visual = { label: 'Lighting', tone: 'lighting', icon: Lightbulb };
  } else if (/\b(camera|mirrorless|dslr|lens|lenses)\b/.test(words)) {
    visual = { label: 'Camera gear', tone: 'camera', icon: Camera };
  }

  const Icon = visual.icon;
  return (
    <div className={`equipment-art art-${visual.tone}`}>
      <span className="art-label">{visual.label}</span>
      <div className="art-mark" aria-hidden="true"><Icon size={42} strokeWidth={1.25} /></div>
    </div>
  );
}

export function EquipmentGallery({ equipment }: { equipment: Equipment }) {
  const [selectedId, setSelectedId] = useState<number>();
  const images = equipment.images ?? [];
  const selected = images.find(({ id }) => id === selectedId) ?? images[0];
  if (!selected) return <EquipmentArt equipment={equipment} />;

  return (
    <>
      <div className="equipment-art equipment-photo">
        <img src={imageUrl(selected.id)} alt={`${equipment.name} photo ${images.indexOf(selected) + 1}`} />
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbnails" role="group" aria-label="Equipment photos">
          {images.map(({ id }, index) => (
            <button key={id} type="button" aria-pressed={selected.id === id} aria-label={`Show photo ${index + 1}`} onClick={() => setSelectedId(id)}>
              <img src={imageUrl(id)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
