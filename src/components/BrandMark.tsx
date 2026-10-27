import { Leaf } from 'lucide-react';

/** HarvestOS brand mark: the original navigation leaf. */
export default function BrandMark({ size = 26 }: { size?: number }) {
  return <Leaf size={size} strokeWidth={2} aria-hidden="true" focusable="false" />;
}
