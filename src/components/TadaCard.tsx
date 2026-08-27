import { Star } from "lucide-react";

interface TadaCardProps {
    text: string;
    category: string;
}

export function TadaCard({ text, category }: TadaCardProps) {
    return (
        <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-300 to-fuchsia-300 rounded-lg blur opacity-60"></div>
            <div className="relative px-6 py-6 bg-white ring-1 ring-gray-900/5 rounded-lg leading-none space-x-6">
                <div className="flex items-center justify-start gap-4">
                    <Star className="w-6 h-6 text-indigo-300 flex-shrink-0 fill-indigo-200" aria-hidden="true" />
                    <p className="text-slate-800 text-base">{text}</p>
                </div>
                <div className="flex justify-end mt-3">
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-indigo-700 inset-ring inset-ring-purple-700/10">{category}</span>
                </div>
            </div>
        </div>
    );
}
