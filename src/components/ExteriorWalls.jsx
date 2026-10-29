// src/components/ExteriorWalls.jsx
'use client';
import WallCategory from '@/components/WallCategory';

export default function ExteriorWalls({ title = 'Exterior walls', ...props }) {
  return <WallCategory variant="exterior" title={title} {...props} />;
}
