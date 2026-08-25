import { groupByDay } from "../tadas";
import { TadaCard } from "./TadaCard";

export function TadaGroups({ groups }: { groups: ReturnType<typeof groupByDay> }) {
    return (
        <>
            {groups.map((group) => (
                <div key={group.date} className="space-y-4">
                    <div className="px-5">
                        <h2 className="text-base font-semibold text-primary">
                            {group.date_label}
                        </h2>
                    </div>

                    {group.items.map((tada) => (
                        <TadaCard key={tada.id} text={tada.achievement} category={tada.category} />
                    ))}
                </div>
            ))}
        </>
    );
}
