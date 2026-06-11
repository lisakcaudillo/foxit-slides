import { ArrowRight } from 'lucide-react';

interface ContinueButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  children?: React.ReactNode;
}

export default function ContinueButton({
  onClick,
  disabled = false,
  isLoading = false,
  loadingText = 'Processing...',
  children = 'Continue',
}: ContinueButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
    >
      {isLoading ? loadingText : children}
      {!isLoading && <ArrowRight className="h-5 w-5 ml-2" />}
    </button>
  );
}
