'use client';

import { Fragment, useState } from 'react';
import { Card, CardHeader } from '@/components/ui';
import type { ClaimEvidence, Evidence } from '@/types';
import { ChevronDown, ChevronRight, FileText, Link2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EvidenceMapTableProps {
  claims: ClaimEvidence[];
  onSelectClaim?: (claim: ClaimEvidence) => void;
  selectedClaimId?: string;
}

export function EvidenceMapTable({ claims, onSelectClaim, selectedClaimId }: EvidenceMapTableProps) {
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());

  const toggleClaim = (claimId: string) => {
    const newExpanded = new Set(expandedClaims);
    if (newExpanded.has(claimId)) {
      newExpanded.delete(claimId);
    } else {
      newExpanded.add(claimId);
    }
    setExpandedClaims(newExpanded);
  };

  return (
    <Card>
      <CardHeader
        title="Claim–Evidence Map"
        subtitle="主張とその根拠の対応関係"
      />
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-medium text-gray-700">主張</th>
              <th className="text-center py-3 px-4 font-medium text-gray-700 w-24">強度</th>
              <th className="text-center py-3 px-4 font-medium text-gray-700 w-24">エビデンス</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <Fragment key={claim.claim_id}>
                <tr
                  className={cn(
                    'border-b border-gray-100 hover:bg-gray-50 cursor-pointer',
                    selectedClaimId === claim.claim_id && 'bg-indigo-50'
                  )}
                  onClick={() => {
                    toggleClaim(claim.claim_id);
                    onSelectClaim?.(claim);
                  }}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-gray-900 line-clamp-2">
                          {claim.claim_text}
                        </p>
                        {claim.location && (
                          <p className="text-xs text-gray-500 mt-1">
                            {claim.location.page && `p.${claim.location.page} `}
                            {claim.location.snippet && `"${claim.location.snippet.slice(0, 50)}..."`}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StrengthBadge strength={claim.strength} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-sm text-gray-600">
                      {claim.evidence.length}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    {expandedClaims.has(claim.claim_id) ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </td>
                </tr>
                {expandedClaims.has(claim.claim_id) && (
                  <tr>
                    <td colSpan={4} className="bg-gray-50 px-4 py-3">
                      <EvidenceList evidence={claim.evidence} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StrengthBadge({ strength }: { strength: ClaimEvidence['strength'] }) {
  const config = {
    strong: { label: '強', color: 'bg-green-100 text-green-800' },
    moderate: { label: '中', color: 'bg-yellow-100 text-yellow-800' },
    weak: { label: '弱', color: 'bg-orange-100 text-orange-800' },
    none: { label: 'なし', color: 'bg-red-100 text-red-800' },
  };

  const { label, color } = config[strength];

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded', color)}>
      {label}
    </span>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">エビデンスが見つかりません</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {evidence.map((ev, index) => (
        <div key={index} className="flex items-start gap-2">
          <Link2 className="w-4 h-4 text-indigo-500 mt-1 flex-shrink-0" />
          <div>
            <span className="text-xs font-medium text-gray-600">
              {getEvidenceTypeLabel(ev.type)}
              {ev.ref_id && ` (${ev.ref_id})`}
            </span>
            {ev.snippet && (
              <p className="text-sm text-gray-700 mt-1">{ev.snippet}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function getEvidenceTypeLabel(type: Evidence['type']): string {
  const labels = {
    citation: '引用',
    figure: '図',
    table: '表',
    calculation: '計算',
    experiment: '実験',
  };
  return labels[type];
}
