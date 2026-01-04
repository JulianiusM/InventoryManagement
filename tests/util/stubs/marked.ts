// Stub for marked library in tests
export const marked = {
    parse: (markdown: string): string => {
        // Simple mock implementation for tests
        return `<p>${markdown}</p>`;
    },
    setOptions: () => {},
};

export default marked;
