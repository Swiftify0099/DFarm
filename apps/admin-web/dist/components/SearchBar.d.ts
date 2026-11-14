import React from 'react';
export interface SearchBarProps {
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    debounceMs?: number;
}
export declare const SearchBar: React.FC<SearchBarProps>;
//# sourceMappingURL=SearchBar.d.ts.map