import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export function ServiceForm({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [supportContact, setSupportContact] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await apiClient.post('/admin/services', {
      name, description, category, tags: [], ownerId, launchType: 'SSO', supportContact,
    });
    setName(''); setDescription(''); setCategory(''); setSupportContact('');
    onCreated();
  }

  return (
    <form onSubmit={onSubmit} aria-label={strings.createServiceButton} className="grid grid-cols-2 gap-2">
      <label htmlFor="svc-name">{strings.nameLabel}<input id="svc-name" required value={name} onChange={(e) => setName(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <label htmlFor="svc-category">{strings.categoryLabel}<input id="svc-category" required value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <label htmlFor="svc-description" className="col-span-2">{strings.descriptionLabel}<input id="svc-description" required value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <label htmlFor="svc-support" className="col-span-2">{strings.supportContactLabel}<input id="svc-support" required value={supportContact} onChange={(e) => setSupportContact(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <button type="submit" className="col-span-2 rounded bg-accent px-3 py-1 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark">{strings.createServiceButton}</button>
    </form>
  );
}
