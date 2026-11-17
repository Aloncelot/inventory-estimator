// src/components/InteriorWalls.jsx — a level's interior wall sections (see WallCategory.jsx)
'use client';
import WallCategory from '@/components/WallCategory';

export default function InteriorWalls({ title = 'Interior walls', ...props }) {
  return <WallCategory variant="interior" title={title} {...props} />;
}
