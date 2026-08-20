import { useEffect, useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { TadaGroups } from "./components/TadaGroups";

interface Tada {
    id: number;
    achieved_at: string;
    achievement: string;
}

interface TadaFileEntry {
    date: string;
    text: string;
}

async function readTadas(): Promise<Tada[]> {
    const resp = await fetch(`${import.meta.env.BASE_URL}data/tadas.json`);
    const tadaDatas: TadaFileEntry[] = await resp.json();
    return tadaDatas.map((tada, index) => {
        const [day, month, year] = tada.date.split("/");
        return {
            id: index + 1,
            achieved_at: `${year}-${month}-${day}`,
            achievement: tada.text,
        };
    });
}

function formatDayHeading(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    if (sameDay(d, today)) return "Today";
    if (sameDay(d, yesterday)) return "Yesterday";

    return d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function groupByDay(
    tadas: Tada[],
): { date: string; date_label: string; items: Tada[] }[] {
    const groups: Record<string, { date_label: string; items: Tada[] }> = {};
    for (const tada of tadas) {
        const achieved_date = new Date(tada.achieved_at);
        const key = `${String(achieved_date.getDate()).padStart(2, '0')}-${String(achieved_date.getMonth() + 1).padStart(2, '0')}-${achieved_date.getFullYear()}`;
        if (!groups[key]) {
            groups[key] = { date_label: formatDayHeading(tada.achieved_at), items: [] };
        }
        groups[key].items.push(tada);
    }
    return Object.entries(groups).map(([date, g]) => ({ date, ...g }));
}

export { groupByDay };

export default function Home() {
    const [tadas, setTadas] = useState<Tada[] | null>(null);

    useEffect(() => {
        readTadas().then(setTadas);
    }, []);

    const groups = tadas ? groupByDay(tadas) : [];

    return (
        <main className="min-h-screen px-4 py-10 bg-gradient-to-r from-blue-50 to-fuchsia-50">
            <div className="mx-auto max-w-[680px] space-y-6">
                <div className="flex items-center justify-center gap-2">
                    <h1 className="text-4xl font-semibold tracking-tight text-primary">
                        Tadas!
                    </h1>
                </div>

                {tadas && tadas.length === 0 ? (
                    <EmptyState />
                ) : (
                    <TadaGroups groups={groups} />
                )}
            </div>
        </main>
    );
}