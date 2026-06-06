import type { PodParentMode } from '../../../../shared/constants/types';

export interface LayoutModeControlProps {
  mode: PodParentMode;
  onChange: (mode: PodParentMode) => void;
}
