import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ChevronDown, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api, request } from '../../shared/api';
import { PageHeading } from '../../shared/components/page-heading';
import { useSession } from '../auth/session';
import { catalogKey, type Equipment } from '../catalog/catalog-query';
import { imageUrl } from '../catalog/equipment-art';

interface Unit {
  id: number;
  assetTag: string;
  status: 'IN_SERVICE' | 'OUT_OF_SERVICE';
}

type Stock = Equipment & { units: Unit[] };
const inventoryKey = ['staff', 'inventory'] as const;
const inventoryPath = '/staff/equipment-types';

function useInventoryMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: inventoryKey }),
        cache.invalidateQueries({ queryKey: catalogKey }),
      ]);
    },
  });
}

function DeleteButton({ path, label }: { path: string; label: string }) {
  const remove = useInventoryMutation(() => api<void>(path, request('DELETE')));
  return (
    <>
      <button
        className="danger"
        type="button"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(`Delete ${label}?`)) remove.mutate();
        }}
      >
        {remove.isPending ? 'Deleting…' : `Delete ${label}`}
      </button>
      {remove.isError && <p className="error" role="alert">{remove.error.message}</p>}
    </>
  );
}

function EquipmentForm({ equipment }: { equipment?: Equipment }) {
  const path = equipment ? `${inventoryPath}/${equipment.id}` : inventoryPath;
  const save = useInventoryMutation((input: Pick<Equipment, 'name' | 'description'>) =>
    api<Equipment>(path, request(equipment ? 'PATCH' : 'POST', input)));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    save.mutate({
      name: String(fields.get('name')),
      description: String(fields.get('description')),
    }, { onSuccess: () => { if (!equipment) form.reset(); } });
  }

  return (
    <form className="form" aria-label={equipment ? `Edit ${equipment.name}` : 'New equipment type'} onSubmit={onSubmit}>
      <label>
        Name
        <input name="name" defaultValue={equipment?.name} maxLength={120} required />
      </label>
      <label>
        Description
        <textarea name="description" defaultValue={equipment?.description} maxLength={1000} rows={3} required />
      </label>
      {save.isError && <p className="error" role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">{equipment ? 'Equipment type updated.' : 'Equipment type added. Expand it to add photos and units.'}</p>}
      <button disabled={save.isPending}>
        {save.isPending ? 'Saving…' : equipment ? 'Save equipment type' : 'Add equipment type'}
      </button>
    </form>
  );
}

function UnitForm({ equipment, unit }: { equipment: Equipment; unit?: Unit }) {
  const unitsPath = `${inventoryPath}/${equipment.id}/units`;
  const path = unit ? `${unitsPath}/${unit.id}` : unitsPath;
  const save = useInventoryMutation((input: { assetTag: string; status: string }) =>
    api<Unit>(path, request(unit ? 'PATCH' : 'POST', input)));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    save.mutate({
      assetTag: String(fields.get('assetTag')),
      status: String(fields.get('status')),
    }, { onSuccess: () => { if (!unit) form.reset(); } });
  }

  return (
    <div className="unit">
      <form className="form" aria-label={unit ? `Edit ${unit.assetTag}` : `Add unit to ${equipment.name}`} onSubmit={onSubmit}>
        <div className="unit-fields">
          <label>
            Asset tag
            <input
              name="assetTag"
              defaultValue={unit?.assetTag}
              pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,63}"
              title="Use letters, digits, and hyphens. Start with a letter or digit."
              maxLength={64}
              placeholder="CAM-001"
              required
            />
          </label>
          <label>
            Service status
            <select name="status" defaultValue={unit?.status ?? 'IN_SERVICE'}>
              <option value="IN_SERVICE">In service</option>
              <option value="OUT_OF_SERVICE">Out of service</option>
            </select>
          </label>
        </div>
        {save.isError && <p className="error" role="alert">{save.error.message}</p>}
        {save.isSuccess && <p role="status">{unit ? 'Unit updated.' : 'Unit added.'}</p>}
        <div className="actions">
          <button disabled={save.isPending}>
            {save.isPending ? 'Saving…' : unit ? 'Save unit' : 'Add unit'}
          </button>
          {unit && <DeleteButton path={path} label={unit.assetTag} />}
        </div>
      </form>
    </div>
  );
}

function ProductImages({ equipment }: { equipment: Equipment }) {
  const [files, setFiles] = useState<File[]>([]);
  const images = equipment.images ?? [];
  const remaining = 5 - images.length;
  const path = `${inventoryPath}/${equipment.id}/images`;
  const upload = useInventoryMutation((selected: File[]) => {
    const body = new FormData();
    selected.forEach((file) => body.append('images', file));
    return api<void>(path, { method: 'POST', body });
  });
  const remove = useInventoryMutation((id: number) => api<void>(`${path}/${id}`, request('DELETE')));
  const selectionError = files.length > remaining
    ? `You can add ${remaining} more ${remaining === 1 ? 'image' : 'images'}.`
    : files.some((file) => file.size > 2 * 1024 * 1024) ? 'Each image must be 2 MB or smaller.' : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || selectionError) return;
    const form = event.currentTarget;
    upload.mutate(files, { onSuccess: () => { form.reset(); setFiles([]); } });
  }

  return (
    <section className="product-images" aria-label={`Product images for ${equipment.name}`}>
      <h3>Product images <span className="count-pill">{images.length} of 5</span></h3>
      {images.length === 0 && <p className="muted">Add a photo to give this listing a cover image.</p>}
      {images.length > 0 && (
        <ul className="staff-gallery">
          {images.map(({ id }, index) => (
            <li key={id}>
              <img src={imageUrl(id)} alt={`${equipment.name} photo ${index + 1}`} loading="lazy" />
              <div>
                <span>{index === 0 ? 'Cover' : `Photo ${index + 1}`}</span>
                <button type="button" className="danger icon-button" disabled={upload.isPending || remove.isPending}
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() => { if (window.confirm('Remove this product photo?')) remove.mutate(id); }}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <form className="form" onSubmit={submit}>
          <label>Choose product images<input type="file" multiple accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
          <small className="muted">JPEG, PNG, or WebP up to 2 MB per image. The first photo appears in the catalog.</small>
          {selectionError && <p className="notice error" role="alert">{selectionError}</p>}
          <button type="submit" disabled={!files.length || !!selectionError || upload.isPending || remove.isPending}>
            <ImagePlus size={17} aria-hidden="true" /> {upload.isPending ? 'Uploading…' : 'Upload images'}
          </button>
        </form>
      )}
      {(upload.isError || remove.isError) && <p className="notice error" role="alert">{upload.error?.message ?? remove.error?.message}</p>}
      {upload.isSuccess && <p className="notice success" role="status">Product images added.</p>}
      {remove.isSuccess && <p className="notice success" role="status">Product image removed.</p>}
    </section>
  );
}

function StockPanel({ equipment }: { equipment: Stock }) {
  const inService = equipment.units.filter(({ status }) => status === 'IN_SERVICE').length;
  const cover = equipment.images?.[0];

  return (
    <details className="panel stock-panel">
      <summary>
        <span className="stock-icon">{cover ? <img src={imageUrl(cover.id)} alt="" loading="lazy" /> : <Boxes size={19} aria-hidden="true" />}</span>
        <span className="stock-title"><strong>{equipment.name}</strong><small>{inService} of {equipment.units.length} in service</small></span>
        <ChevronDown className="stock-chevron" size={18} aria-hidden="true" />
      </summary>
      <EquipmentForm equipment={equipment} />
      <DeleteButton path={`${inventoryPath}/${equipment.id}`} label={equipment.name} />
      <ProductImages equipment={equipment} />
      <h3>Physical units</h3>
      {equipment.units.length === 0 && <p>No units have been added to this equipment type.</p>}
      {equipment.units.map((unit) => <UnitForm key={unit.id} equipment={equipment} unit={unit} />)}
      <h4>Add a unit</h4>
      <UnitForm equipment={equipment} />
    </details>
  );
}

function StaffInventory() {
  const inventory = useQuery({
    queryKey: inventoryKey,
    queryFn: ({ signal }) => api<Stock[]>(inventoryPath, { signal }),
    retry: false,
  });

  return (
    <div className="inventory-layout">
      <section className="panel inventory-create" aria-labelledby="add-equipment-heading">
        <div className="heading-icon"><Plus size={22} aria-hidden="true" /></div>
        <h2 id="add-equipment-heading">Add equipment type</h2>
        <p className="muted">Create a catalog listing, then add photos and physical units.</p>
        <EquipmentForm />
      </section>
      <div>
        <header className="section-heading">
          <h2>Equipment types</h2>
          {inventory.data && <span className="count-pill">{inventory.data.length}</span>}
        </header>
        {inventory.isPending && <p className="panel muted" role="status">Loading inventory…</p>}
        {inventory.isError && (
          <div className="panel">
            <p className="error" role="alert">{inventory.error.message}</p>
            <button type="button" onClick={() => void inventory.refetch()}>Try again</button>
          </div>
        )}
        {inventory.data?.length === 0 && <p className="panel muted" role="status">Inventory is empty.</p>}
        {!!inventory.data?.length && <p className="muted">Expand an equipment type to edit it or manage its units.</p>}
        <div className="stock-list">
          {inventory.data?.map((equipment) => <StockPanel key={equipment.id} equipment={equipment} />)}
        </div>
      </div>
    </div>
  );
}

export function InventoryPage() {
  const session = useSession();

  return (
    <main className="workspace-page">
      <PageHeading eyebrow="Staff workspace" title="Equipment inventory" description="Manage catalog listings, physical assets, and their service status." icon={Boxes} />
      {session.isPending && <p role="status">Checking your session…</p>}
      {session.isError && <button type="button" onClick={() => void session.refetch()}>Retry session check</button>}
      {session.data === null && <p><Link to="/login">Sign in</Link> to access staff inventory.</p>}
      {session.data?.role === 'CUSTOMER' && <p role="alert">This page requires a staff account.</p>}
      {session.data?.role === 'STAFF' && <StaffInventory />}
    </main>
  );
}
