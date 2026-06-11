import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export default function BackButton({ onClick, label = 'Back' }: BackButtonProps) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center"
    >
      <ArrowLeft className="h-4 w-4 mr-2" />
      {label}
    </button>
  );
}
