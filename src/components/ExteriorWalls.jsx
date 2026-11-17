// src/components/ExteriorWalls.jsx — a level's exterior wall sections (see WallCategory.jsx)
'use client';
import WallCategory from '@/components/WallCategory';

export default function ExteriorWalls({ title = 'Exterior walls', ...props }) {
  return <WallCategory variant="exterior" title={title} {...props} />;
}
