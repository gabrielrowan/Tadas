import { Star } from "lucide-react";

interface TadaCardProps {
    text: string;
    category: string;
}

export function TadaCard({ text, category }: TadaCardProps) {
    return (
        <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-300 to-fuchsia-300 rounded-lg blur opacity-60"></div>
            <div className="relative px-7 py-6 bg-white ring-1 ring-gray-900/5 rounded-lg leading-none flex items-center justify-start space-x-6">
                <Star className="w-6 h-6 text-indigo-300 flex-shrink-0 fill-indigo-200" aria-hidden="true" />
                <p className="text-slate-800 text-base">{text}</p>
            </div>
            <div className="flex justify-end mt-2">
                <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 inset-ring inset-ring-purple-700/10">{category}</span>
            </div>
        </div>
    );
}
