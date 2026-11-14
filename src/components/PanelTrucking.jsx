// src/components/PanelTrucking.jsx
// Delivering the wall panels: the company types its own numbers (trucks and
// rates differ): panels per truck, rate per mile, base fee and the miles to
// the job, counted one way or there and back.
'use client';

import { GroupBlock, NumInput, Fld, fmtMoney } from '@/components/ui/mat';
import { computeTrucking } from '@/domain/estimate';

const num = (v) => (Number(v) || 0).toLocaleString('en-US');

export default function PanelTrucking({ data, calc: calcProp, autoPanels = 0, onChange }) {
  const d = data || {};
  const calc = calcProp || computeTrucking(d, autoPanels);
  const set = (key, v) => onChange((p) => ({ ...(p || {}), [key]: v }));
  const open = d.collapsed === false || (d.collapsed === undefined && !calc.total);

  return (
    <GroupBlock
      standalone
      title="Panel trucking"
      subtotal={calc.total}
      open={open}
      onToggle={(o) => set('collapsed', !o)}
    >
      <div className="trk">
        <Fld label="Panels" w={70} title={calc.panelsTyped ? 'Typed; clear it to use the panels the estimate counts' : 'From the estimate; type to change'}>
          <NumInput allowEmpty value={calc.panelsTyped ? d.panels : ''} placeholder={String(calc.autoPanels)} onCommit={(v) => set('panels', v === '' || v === null ? null : v)} />
        </Fld>
        <Fld label="Panels per truck" w={70}><NumInput allowEmpty value={d.panelsPerTruck ?? ''} placeholder="e.g. 20" onCommit={(v) => set('panelsPerTruck', v)} /></Fld>
        <Fld label="Miles to the job" w={70}><NumInput allowEmpty value={d.miles ?? ''} placeholder="0" onCommit={(v) => set('miles', v)} /></Fld>
        <Fld label="Miles charged" w={150}>
          <select className="ew-select" value={d.milesBasis === 'one' ? 'one' : 'round'} onChange={(e) => set('milesBasis', e.target.value)}>
            <option value="round">There and back</option>
            <option value="one">One way</option>
          </select>
        </Fld>
        <Fld label="Rate per mile ($)" w={70}><NumInput allowEmpty step="0.01" value={d.perMile ?? ''} placeholder="e.g. 4" onCommit={(v) => set('perMile', v)} /></Fld>
        <Fld label="Base fee per truck ($)" w={80}><NumInput allowEmpty step="0.01" value={d.baseFee ?? ''} placeholder="e.g. 100" onCommit={(v) => set('baseFee', v)} /></Fld>
      </div>
      <p className="trk-calc">
        {calc.trucks
          ? <>{num(calc.panels)} panels ÷ {num(calc.perTruck)} per truck = <strong>{num(calc.trucks)} truck{calc.trucks === 1 ? '' : 's'}</strong> × ({fmtMoney(Number(d.baseFee) || 0)} + {fmtMoney(Number(d.perMile) || 0)} × {num(calc.milesCharged)} mi = {fmtMoney(calc.perTrip)}) = <strong>{fmtMoney(calc.total)}</strong></>
          : calc.missing.length ? <span className="ew-subtle">Enter {calc.missing.join(', ')} to price the delivery.</span>
            : <span className="ew-subtle">No panels to deliver yet.</span>}
      </p>
      <p className="ew-subtle trk-note">A delivery charge: no error buffer or material markup on it. The quote shows it as Panel delivery.</p>
    </GroupBlock>
  );
}
