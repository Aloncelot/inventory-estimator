'use client';

import { useState, useMemo } from 'react';
import Levels from '@/components/Levels';

export default function Home() {
const [extTotals, setExtTotals] = useState({ extLengthSum: 0, extZipSheetsSum: 0, extPlatePieces: 0, extPTLFSum: 0 });
const [intTotals, setIntTotals] = useState({ int2x6LF: 0, int2x4LF: 0, intPlatePieces: 0, intPTLFSum: 0 });

const combined = useMemo(() => {
  return {
    extLengthLF: extTotals.extLengthSum,
    extZipSheetsFinal: extTotals.extZipSheetsSum,
    int2x6LF: intTotals.int2x6LF,
    int2x4LF: intTotals.int2x4LF,
    platePiecesTotal: (extTotals.extPlatePieces || 0) + (intTotals.intPlatePieces || 0),
    ptLFTotal: (extTotals.extPTLFSum || 0) + (intTotals.intPTLFSum || 0),
  };
}, [extTotals, intTotals]);

  return (
    <main style={{ padding: 24 }}>
     <Levels/>
    </main>
  );
}
