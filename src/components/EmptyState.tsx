import { Star } from "lucide-react";

export function EmptyState() {
    return (
        <div
            className="rounded-xl p-8 text-center space-y-2"
            style={{ background: "rgba(255,255,255,0.6)" }}
        >
            <Star className="mx-auto size-8 text-accent" aria-hidden="true" />
            <p className="text-base font-semibold text-primary">No tadas yet</p>
            <p className="text-sm text-secondary">
                Your achievements will appear here once you add them.
            </p>
        </div>
    );
}
