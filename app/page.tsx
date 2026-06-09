'use client';
import { useState } from 'react';

type Gender = 'male' | 'female';
type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

const RETURN_RATES: Record<RiskProfile, number> = {
  conservative: 0.02,
  balanced: 0.05,
  aggressive: 0.08,
};

// 通膨率:每年 2%。把現值支出換算成退休當年的名目金額,並在退休後逐年複利成長
const INFLATION_RATE: number = 0.02;

const RISK_LABELS: Record<RiskProfile, string> = {
  conservative: '保守型',
  balanced: '穩健型',
  aggressive: '積極型',
};

const RISK_SUBTITLES: Record<RiskProfile, string> = {
  conservative: '重視穩定,少波動',
  balanced: '長期成長,可承受中度波動',
  aggressive: '追求最大化,可承受高波動',
};

const RISK_VOLATILITY: Record<RiskProfile, string> = {
  conservative: '願意承受投資組合 ±10% 的波動',
  balanced: '願意承受投資組合 ±20% 的波動',
  aggressive: '願意承受投資組合 ±50% 以上的波動',
};

const LIFE_EXPECTANCY: Record<Gender, number> = {
  male: 77,
  female: 84,
};

interface Result {
  riskProfile: RiskProfile;
  totalAtRetirement: number;
  needAtRetirement: number;
  gap: number;
  readinessRatio: number;
  canLastUntilAge: number;
}

interface YearPoint {
  age: number;
  balance: number;
  phase: 'accumulation' | 'depletion';
}

function calculate(
  currentAge: number,
  retirementAge: number,
  monthlyExpense: number,
  gender: Gender,
  currentSavings: number,
  monthlySaving: number,
  riskProfile: RiskProfile
): Result {
  const rate = RETURN_RATES[riskProfile];
  const lifeExpectancy = LIFE_EXPECTANCY[gender];
  const yearsToRetire = Math.max(0, retirementAge - currentAge);
  const yearsAfterRetire = Math.max(0, lifeExpectancy - retirementAge);

  const annualContribution = monthlySaving * 12;
  const compoundedPresent = currentSavings * Math.pow(1 + rate, yearsToRetire);
  const annuityFV = rate === 0
    ? annualContribution * yearsToRetire
    : annualContribution * ((Math.pow(1 + rate, yearsToRetire) - 1) / rate);
  const totalAtRetirement = Math.round(compoundedPresent + annuityFV);

  // 退休當年的月支出:把現值經通膨複利到退休那一年
  const monthlyExpenseAtRetirement = monthlyExpense * Math.pow(1 + INFLATION_RATE, yearsToRetire);
  const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12;

  // 退休所需準備金(退休當年的現值):未來逐年隨通膨成長的支出,以投報率折現。
  // 與下方「可撐到」的逐年模擬同一套假設,因此準備率與資產軌跡圖永遠一致:
  // 準備率 ≥ 100% ⟺ 資產可撐到平均餘命(軌跡線不會在餘命前跌破 0)。
  const discountRatio = (1 + INFLATION_RATE) / (1 + rate);
  const needAtRetirement = yearsAfterRetire <= 0
    ? 0
    : Math.abs(1 - discountRatio) < 1e-9
      ? (annualExpenseAtRetirement / (1 + rate)) * yearsAfterRetire
      : (annualExpenseAtRetirement / (1 + rate)) * ((1 - Math.pow(discountRatio, yearsAfterRetire)) / (1 - discountRatio));
  const gap = needAtRetirement - totalAtRetirement;
  const readinessRatio = needAtRetirement > 0
    ? Math.min(200, Math.round((totalAtRetirement / needAtRetirement) * 100))
    : 200;

  // 計算可撐到幾歲:退休後資產續以報酬率成長,每年提領的金額逐年隨通膨增加
  let balance = totalAtRetirement;
  let annualExpense = annualExpenseAtRetirement;
  let age = retirementAge;
  while (balance > 0 && age < lifeExpectancy) {
    balance = balance * (1 + rate) - annualExpense;
    annualExpense = annualExpense * (1 + INFLATION_RATE);
    age++;
  }

  return {
    riskProfile,
    totalAtRetirement,
    needAtRetirement,
    gap,
    readinessRatio,
    canLastUntilAge: age,
  };
}

function generateTrajectory(
  currentAge: number,
  retirementAge: number,
  monthlyExpense: number,
  gender: Gender,
  currentSavings: number,
  monthlySaving: number,
  riskProfile: RiskProfile
): YearPoint[] {
  const rate = RETURN_RATES[riskProfile];
  const lifeExpectancy = LIFE_EXPECTANCY[gender];
  const points: YearPoint[] = [];
  let balance = currentSavings;
  const annualContribution = monthlySaving * 12;
  const yearsToRetire = Math.max(0, retirementAge - currentAge);
  // 退休當年的年支出(現值經通膨複利到退休年),退休後再逐年隨通膨成長
  const annualExpenseAtRetirement = monthlyExpense * Math.pow(1 + INFLATION_RATE, yearsToRetire) * 12;

  for (let age = currentAge; age <= lifeExpectancy; age++) {
    if (age < retirementAge) {
      points.push({ age, balance: Math.max(0, Math.round(balance)), phase: 'accumulation' });
      balance = balance * (1 + rate) + annualContribution;
    } else {
      // 退休期:不再對餘額設 0 下限,讓資金見底後跌破 0、累積赤字(用於紅色負向線)
      points.push({ age, balance: Math.round(balance), phase: 'depletion' });
      const annualExpense = annualExpenseAtRetirement * Math.pow(1 + INFLATION_RATE, age - retirementAge);
      balance = balance >= 0
        ? balance * (1 + rate) - annualExpense   // 仍有資產:續成長後提領
        : balance - annualExpense;               // 已見底:赤字逐年累積(無投資成長)
    }
  }
  return points;
}

// 千分位顯示輔助
function formatNum(v: number | undefined): string {
  if (v === undefined || isNaN(v)) return '';
  return v.toLocaleString();
}
function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, '').replace(/[^\d]/g, '');
  if (!cleaned) return undefined;
  return parseInt(cleaned, 10);
}

export default function Home() {
  const [currentAge, setCurrentAge] = useState<number | undefined>(35);
  const [retirementAge, setRetirementAge] = useState<number | undefined>(65);
  const [monthlyExpense, setMonthlyExpense] = useState<number | undefined>(50000);
  const [gender, setGender] = useState<Gender | null>(null);
  const [currentSavings, setCurrentSavings] = useState<number | undefined>(undefined);
  const [monthlySaving, setMonthlySaving] = useState<number | undefined>(undefined);
  const [selectedRisk, setSelectedRisk] = useState<RiskProfile | null>(null);

  const canSubmit =
    currentAge !== undefined &&
    retirementAge !== undefined &&
    retirementAge > currentAge &&
    monthlyExpense !== undefined && monthlyExpense > 0 &&
    gender !== null &&
    currentSavings !== undefined &&
    monthlySaving !== undefined;

  const result = canSubmit && selectedRisk
    ? calculate(currentAge!, retirementAge!, monthlyExpense!, gender!, currentSavings!, monthlySaving!, selectedRisk)
    : null;

  const trajectory = canSubmit && selectedRisk
    ? generateTrajectory(currentAge!, retirementAge!, monthlyExpense!, gender!, currentSavings!, monthlySaving!, selectedRisk)
    : [];

  const allResults = canSubmit
    ? {
        conservative: calculate(currentAge!, retirementAge!, monthlyExpense!, gender!, currentSavings!, monthlySaving!, 'conservative'),
        balanced: calculate(currentAge!, retirementAge!, monthlyExpense!, gender!, currentSavings!, monthlySaving!, 'balanced'),
        aggressive: calculate(currentAge!, retirementAge!, monthlyExpense!, gender!, currentSavings!, monthlySaving!, 'aggressive'),
      }
    : null;

  return (
    <main className="min-h-screen bg-[#F4ECD8] py-12 px-6">
      <article className="max-w-3xl mx-auto">

        {/* Hero */}
        <header className="text-center mb-12">
          <p className="text-[#001E3D]/50 mb-3 tracking-widest uppercase text-sm">
            Retirement Calculator
          </p>
          <h1
            className="text-[#001E3D] mb-4 text-5xl font-serif"
            style={{ letterSpacing: '-0.02em' }}
          >
            退休夠不夠?
          </h1>
          <div className="h-px bg-[#C9A961] w-24 mx-auto mb-6" />
          <p className="text-[#001E3D]/70 italic text-lg">
            60 秒回答 6 個問題,告訴你答案。
          </p>
        </header>

        {/* 輸入區 */}
        <div className="bg-[#FAF7EE] rounded-3xl p-6 md:p-10 mb-8 space-y-6">

          <div className="grid grid-cols-2 gap-4">
            <Field label="目前年紀" unit="歲">
              <input
                type="text"
                inputMode="numeric"
                value={currentAge ?? ''}
                onChange={e => setCurrentAge(parseNum(e.target.value))}
                placeholder="35"
                className="w-full bg-transparent border-b border-[#001E3D]/20 focus:border-[#001E3D]/60 text-[#001E3D] text-right py-2 outline-none"
              />
            </Field>
            <Field label="想退休的年紀" unit="歲">
              <input
                type="text"
                inputMode="numeric"
                value={retirementAge ?? ''}
                onChange={e => setRetirementAge(parseNum(e.target.value))}
                placeholder="65"
                className="w-full bg-transparent border-b border-[#001E3D]/20 focus:border-[#001E3D]/60 text-[#001E3D] text-right py-2 outline-none"
              />
            </Field>
          </div>

          {retirementAge !== undefined && currentAge !== undefined && retirementAge <= currentAge && (
            <p className="text-[#C9A961] text-sm">退休年紀需要比目前年紀大</p>
          )}

          <Field label="退休後每月想用多少" unit="元">
            <input
              type="text"
              inputMode="numeric"
              value={formatNum(monthlyExpense)}
              onChange={e => setMonthlyExpense(parseNum(e.target.value))}
              placeholder="50,000"
              className="w-full bg-transparent border-b border-[#001E3D]/20 focus:border-[#001E3D]/60 text-[#001E3D] text-right py-2 outline-none"
            />
          </Field>

          <Field label="性別(用台灣平均餘命計算)" unit="">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`px-4 py-3 rounded-full transition ${
                  gender === 'male'
                    ? 'bg-[#001E3D] text-white'
                    : 'bg-white/60 text-[#001E3D] border border-[#001E3D]/20 hover:border-[#001E3D]/40'
                }`}
              >
                男(平均 77 歲)
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`px-4 py-3 rounded-full transition ${
                  gender === 'female'
                    ? 'bg-[#001E3D] text-white'
                    : 'bg-white/60 text-[#001E3D] border border-[#001E3D]/20 hover:border-[#001E3D]/40'
                }`}
              >
                女(平均 84 歲)
              </button>
            </div>
          </Field>

          <Field label="目前的存款(含投資)" unit="元">
            <input
              type="text"
              inputMode="numeric"
              value={formatNum(currentSavings)}
              onChange={e => setCurrentSavings(parseNum(e.target.value))}
              placeholder="2,000,000"
              className="w-full bg-transparent border-b border-[#001E3D]/20 focus:border-[#001E3D]/60 text-[#001E3D] text-right py-2 outline-none"
            />
          </Field>

          <Field label="每月可以存下的錢" unit="元">
            <input
              type="text"
              inputMode="numeric"
              value={formatNum(monthlySaving)}
              onChange={e => setMonthlySaving(parseNum(e.target.value))}
              placeholder="20,000"
              className="w-full bg-transparent border-b border-[#001E3D]/20 focus:border-[#001E3D]/60 text-[#001E3D] text-right py-2 outline-none"
            />
          </Field>
        </div>

        {/* 三檔按鈕 */}
        <p className="text-[#001E3D]/70 italic text-center mb-4">
          選擇你是哪一種投資人,就能算
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-12">
          {(['conservative', 'balanced', 'aggressive'] as RiskProfile[]).map((profile, i) => {
            const isSelected = selectedRisk === profile;
            const isRecommended = i === 1;
            const r = allResults?.[profile];
            return (
              <button
                key={profile}
                type="button"
                onClick={() => setSelectedRisk(profile)}
                disabled={!canSubmit}
                className={`relative rounded-3xl p-5 transition text-center disabled:opacity-40 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-[#001E3D] text-white ring-2 ring-[#C9A961] ring-offset-2 ring-offset-[#F4ECD8] shadow-md'
                    : 'bg-transparent text-[#001E3D] border border-[#001E3D]/25 hover:border-[#001E3D] hover:bg-[#001E3D]/5'
                }`}
              >
                {isSelected && (
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#C9A961] text-[#001E3D] text-xs font-bold shadow">✓</span>
                )}
                {isRecommended && !isSelected && (
                  <span className="absolute top-3 right-3 rounded-full bg-[#C9A961] text-[#001E3D] text-[10px] px-2 py-0.5 font-semibold">推薦</span>
                )}
                <div className="text-xl font-serif mb-1">{RISK_LABELS[profile]}</div>
                <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-[#001E3D]/60'}`}>
                  {RISK_SUBTITLES[profile]}
                </div>
                <div className={`text-xs mt-2 pt-2 border-t ${isSelected ? 'text-white/60 border-white/20' : 'text-[#001E3D]/50 border-[#001E3D]/15'}`}>
                  {RISK_VOLATILITY[profile]}
                </div>
                {r && (
                  <div className={`mt-3 pt-3 border-t ${isSelected ? 'border-white/20' : 'border-[#001E3D]/15'}`}>
                    <div className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-[#001E3D]'}`}>
                      準備率 {r.readinessRatio}%
                    </div>
                    <div className={`text-xs mt-0.5 ${isSelected ? 'text-white/70' : 'text-[#001E3D]/60'}`}>
                      {r.gap > 0 ? `缺 ${Math.round(r.gap / 10000).toLocaleString()} 萬` : '夠用'}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 結果區 */}
        {result && allResults && (
          <section className="mb-12">
            <header className="text-center mb-8">
              <p className="text-[#001E3D]/50 mb-3 tracking-widest uppercase text-sm">
                {RISK_LABELS[result.riskProfile]} · 試算結果
              </p>
              <h2
                className="text-[#001E3D] mb-3 text-4xl font-serif"
                style={{ letterSpacing: '-0.02em' }}
              >
                {result.readinessRatio >= 100 ? '夠用' : '還有缺口'}
              </h2>
              <div className="h-px bg-[#C9A961] w-24 mx-auto mb-6" />

              <div className="grid grid-cols-3 gap-4 mt-8">
                <Metric label="準備率" value={`${result.readinessRatio}`} unit="%" />
                <Metric
                  label="缺口"
                  value={result.gap > 0 ? `${Math.round(result.gap / 10000).toLocaleString()}` : '0'}
                  unit="萬"
                />
                <Metric
                  label="可撐到"
                  value={`${Math.min(LIFE_EXPECTANCY[gender!], result.canLastUntilAge)}`}
                  unit={result.canLastUntilAge >= LIFE_EXPECTANCY[gender!] ? '歲+' : '歲'}
                />
              </div>

              <p className="text-[#001E3D]/60 mt-3 italic text-sm">
                {gender === 'male' ? '男性' : '女性'}平均餘命 {LIFE_EXPECTANCY[gender!]} 歲
              </p>
            </header>

            {/* 軌跡圖 */}
            <div className="bg-[#FAF7EE] rounded-3xl p-6 md:p-8 mb-8">
              <h3 className="text-[#001E3D] mb-2 text-2xl font-serif">你的資產軌跡</h3>
              <p className="text-[#001E3D]/60 text-sm mb-6">
                從 {currentAge} 歲到 {LIFE_EXPECTANCY[gender!]} 歲(平均餘命),你的資產會這樣變化
              </p>
              <LifetimeChart
                data={trajectory}
                retirementAge={retirementAge!}
                lifeExpectancy={LIFE_EXPECTANCY[gender!]}
              />
            </div>
          </section>
        )}

        {/* 假設揭露 */}
        <details className="mt-8 mb-12">
          <summary className="text-[#001E3D]/50 cursor-pointer hover:text-[#001E3D]/70 text-sm">
            這個試算用了什麼假設?
          </summary>
          <div className="text-[#001E3D]/60 text-sm mt-3 leading-relaxed bg-[#FAF7EE]/50 rounded-xl p-4">
            <ul className="space-y-2 list-disc ml-5">
              <li>報酬率:保守型 2% / 穩健型 5% / 積極型 8% 年化(歷史參考,實際會有波動)</li>
              <li>平均餘命:內政部 2024 統計,男 77 / 女 84 歲</li>
              <li>已計入通膨:每年 2%——你輸入的是現值,系統會自動換算成退休當年的名目月支出,且退休後每月支出逐年隨通膨複利成長</li>
              <li>未計入稅務、健保、長照等額外支出</li>
              <li>退休後資產仍以同報酬率成長,提領金額逐年隨通膨增加</li>
            </ul>
            <p className="mt-3 italic">這是教育性試算,不構成投資、保險或財務建議。</p>
          </div>
        </details>

        {/* Footer */}
        <footer className="text-center text-[#001E3D]/50 text-xs pt-8 border-t border-[#001E3D]/10">
          Powered by Azimut Sinopro
        </footer>

      </article>
    </main>
  );
}

function Field({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[#001E3D]/60 block mb-2 text-sm flex items-baseline gap-2">
        <span>{label}</span>
        {unit && <span className="text-[#001E3D]/40 text-xs">({unit})</span>}
      </label>
      {children}
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-[#001E3D]/60 text-sm mb-1">{label}</div>
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-[#001E3D] font-bold text-3xl font-serif">{value}</span>
        <span className="text-[#001E3D]/60 text-xs">{unit}</span>
      </div>
    </div>
  );
}

function LifetimeChart({
  data,
  retirementAge,
  lifeExpectancy,
}: {
  data: YearPoint[];
  retirementAge: number;
  lifeExpectancy: number;
}) {
  if (data.length === 0) return null;

  const width = 800;
  const height = 280;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const COLOR_ACC = '#001E3D';   // 累積期
  const COLOR_DEP = '#C9A961';   // 提領期(仍有資產)
  const COLOR_NEG = '#C0392B';   // 資產見底後的赤字

  const balances = data.map(p => p.balance);
  const maxBalance = Math.max(...balances, 1);
  const minBalance = Math.min(...balances, 0);
  const valRange = (maxBalance - minBalance) || 1;
  const minAge = data[0].age;
  const maxAge = data[data.length - 1].age;
  const ageRange = maxAge - minAge || 1;

  const xScale = (age: number) => ((age - minAge) / ageRange) * innerWidth;
  const yScale = (balance: number) => innerHeight - ((balance - minBalance) / valRange) * innerHeight;
  const yZero = yScale(0);

  const accumulation = data.filter(p => p.phase === 'accumulation');
  const depletion = data.filter(p => p.phase === 'depletion');

  // 把提領期切成「仍有資產(金色)」與「見底後(紅色)」兩段,並在跨越 0 的位置插入交點
  const goldPts: { age: number; balance: number }[] = [];
  const redPts: { age: number; balance: number }[] = [];
  let crossAge: number | null = null;
  let crossed = false;
  for (let i = 0; i < depletion.length; i++) {
    const p = depletion[i];
    if (!crossed && p.balance < 0) {
      crossed = true;
      const prev = depletion[i - 1];
      if (prev) {
        const t = prev.balance / (prev.balance - p.balance);
        crossAge = prev.age + t * (p.age - prev.age);
        goldPts.push({ age: crossAge, balance: 0 });
        redPts.push({ age: crossAge, balance: 0 });
      } else {
        crossAge = p.age;
      }
    }
    if (!crossed) goldPts.push({ age: p.age, balance: p.balance });
    else redPts.push({ age: p.age, balance: p.balance });
  }

  const toPath = (pts: { age: number; balance: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.age)} ${yScale(p.balance)}`).join(' ');
  const accPath = accumulation.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.age)} ${yScale(p.balance)}`).join(' ');
  const goldPath = toPath(goldPts);
  const redPath = toPath(redPts);

  const retirementPoint = data.find(p => p.age === retirementAge);
  const lifeX = lifeExpectancy >= minAge && lifeExpectancy <= maxAge ? xScale(lifeExpectancy) : null;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => {
    const value = minBalance + valRange * r;
    return { value, y: yScale(value) };
  });
  const xTicks: number[] = [];
  for (let age = Math.ceil(minAge / 10) * 10; age <= maxAge; age += 10) xTicks.push(age);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto" style={{ minHeight: '240px' }}>
        {yTicks.map(t => (
          <line key={`y-${t.y}`} x1={padding.left} x2={padding.left + innerWidth} y1={padding.top + t.y} y2={padding.top + t.y} stroke="#001E3D" strokeOpacity={0.06} strokeDasharray="2 4" />
        ))}

        {minBalance < 0 && (
          <line x1={padding.left} x2={padding.left + innerWidth} y1={padding.top + yZero} y2={padding.top + yZero} stroke="#001E3D" strokeOpacity={0.35} strokeWidth={1.5} />
        )}

        {retirementPoint && (
          <line x1={padding.left + xScale(retirementAge)} x2={padding.left + xScale(retirementAge)} y1={padding.top} y2={padding.top + innerHeight} stroke="#C9A961" strokeWidth={1.5} strokeDasharray="4 4" />
        )}

        {lifeX !== null && (
          <line x1={padding.left + lifeX} x2={padding.left + lifeX} y1={padding.top} y2={padding.top + innerHeight} stroke="#001E3D" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="2 2" />
        )}

        {accPath && <path d={accPath} fill="none" stroke={COLOR_ACC} strokeWidth={2.5} transform={`translate(${padding.left}, ${padding.top})`} />}
        {goldPath && <path d={goldPath} fill="none" stroke={COLOR_DEP} strokeWidth={2.5} transform={`translate(${padding.left}, ${padding.top})`} />}
        {redPath && <path d={redPath} fill="none" stroke={COLOR_NEG} strokeWidth={2.5} transform={`translate(${padding.left}, ${padding.top})`} />}

        {retirementPoint && (
          <>
            <circle cx={padding.left + xScale(retirementAge)} cy={padding.top + yScale(retirementPoint.balance)} r={5} fill="#C9A961" />
            <text x={padding.left + xScale(retirementAge)} y={padding.top - 6} fontSize={11} fill="#C9A961" textAnchor="middle" fontWeight="600">
              退休 {retirementAge}
            </text>
          </>
        )}

        {crossAge !== null && (
          <>
            <circle cx={padding.left + xScale(crossAge)} cy={padding.top + yZero} r={4} fill={COLOR_NEG} />
            <text x={padding.left + xScale(crossAge)} y={padding.top + yZero - 8} fontSize={11} fill={COLOR_NEG} textAnchor="middle" fontWeight="600">
              {Math.ceil(crossAge)} 歲見底
            </text>
          </>
        )}

        {lifeX !== null && (
          <text x={padding.left + lifeX} y={padding.top - 6} fontSize={11} fill="#001E3D" opacity={0.5} textAnchor="end">
            平均餘命 {lifeExpectancy}
          </text>
        )}

        {yTicks.map(t => (
          <text key={`y-l-${t.y}`} x={padding.left - 8} y={padding.top + t.y + 3} fontSize={10} fill="#001E3D" opacity={0.5} textAnchor="end">
            {Math.round(t.value / 10000).toLocaleString()}萬
          </text>
        ))}

        {xTicks.map(age => (
          <text key={`x-l-${age}`} x={padding.left + xScale(age)} y={padding.top + innerHeight + 20} fontSize={10} fill="#001E3D" opacity={0.5} textAnchor="middle">
            {age} 歲
          </text>
        ))}
      </svg>

      <div className="flex flex-wrap justify-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-2 text-[#001E3D]/70">
          <span className="w-4 h-0.5 bg-[#001E3D]" />累積期
        </div>
        <div className="flex items-center gap-2 text-[#001E3D]/70">
          <span className="w-4 h-0.5 bg-[#C9A961]" />提領期
        </div>
        {redPath && (
          <div className="flex items-center gap-2 text-[#C0392B]">
            <span className="w-4 h-0.5 bg-[#C0392B]" />資產見底(赤字)
          </div>
        )}
      </div>
    </div>
  );
}
