export interface ClayTabItem<T extends string = string> {
    id: T;
    label: string;
    icon?: string;
    badge?: string | number;
}
export interface ClayTabsProps<T extends string = string> {
    tabs: ClayTabItem<T>[];
    activeTab: T;
    onChange: (id: T) => void;
    variant?: 'pill' | 'card';
    className?: string;
}
export declare function ClayTabs<T extends string = string>({ tabs, activeTab, onChange, variant, className, }: ClayTabsProps<T>): import("react").JSX.Element;
//# sourceMappingURL=ClayTabs.d.ts.map