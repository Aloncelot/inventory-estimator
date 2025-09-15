// src/app/projects/page.jsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  addDoc, collection, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';

export default function ProjectsPage() {
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const create = async () => {
    const ref = await addDoc(collection(db, 'projects'), {
      name: name || 'Untitled Project',
      createdAt: serverTimestamp(),
    });
    setName('');
    // navigate to the project
    window.location.href = `/projects/${ref.id}`;
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Projects</h1>

      <div style={{ margin: '12px 0' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Project name"
          style={{ padding: 8, width: 320 }}
        />
        <button onClick={create} style={{ marginLeft: 8, padding: '8px 12px' }}>
          Create
        </button>
      </div>

      <ul>
        {items.map(p => (
          <li key={p.id} style={{ margin: '6px 0' }}>
            <Link href={`/projects/${p.id}`}>{p.name || p.id}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
