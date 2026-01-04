/**
 * Common test keywords for controller tests
 */

/**
 * Setup a mock function to return a specific value
 */
export function setupMock(mockFn: jest.Mock, returnValue?: unknown): void {
    if (returnValue !== undefined) {
        mockFn.mockResolvedValue(returnValue);
    }
}

/**
 * Setup a mock function to throw an error
 */
export function setupMockError(mockFn: jest.Mock, error: Error): void {
    mockFn.mockRejectedValue(error);
}

/**
 * Verify that a result matches expected value
 */
export function verifyResult(result: unknown, expected: unknown): void {
    expect(result).toEqual(expected);
}

/**
 * Verify that a result contains expected properties
 */
export function verifyResultContains(result: object, expected: object): void {
    expect(result).toMatchObject(expected);
}

/**
 * Verify a mock was called with specific arguments
 */
export function verifyMockCall(mockFn: jest.Mock, ...args: unknown[]): void {
    expect(mockFn).toHaveBeenCalledWith(...args);
}

/**
 * Verify a mock was called
 */
export function verifyMockCalled(mockFn: jest.Mock): void {
    expect(mockFn).toHaveBeenCalled();
}

/**
 * Verify a mock was not called
 */
export function verifyMockNotCalled(mockFn: jest.Mock): void {
    expect(mockFn).not.toHaveBeenCalled();
}

/**
 * Verify a function throws an error with specific message
 */
export async function verifyThrowsError(
    fn: () => Promise<unknown>,
    errorMessage: string | RegExp
): Promise<void> {
    await expect(fn()).rejects.toThrow(errorMessage);
}

/**
 * Verify the error type
 */
export async function verifyThrowsExpectedError(
    fn: () => Promise<unknown>,
    errorMessage: string | RegExp
): Promise<void> {
    await expect(fn()).rejects.toMatchObject({
        message: expect.stringMatching(errorMessage),
    });
}

/**
 * Reset all mocks
 */
export function resetAllMocks(...mocks: jest.Mock[]): void {
    mocks.forEach(mock => mock.mockReset());
}

/**
 * Clear all mocks
 */
export function clearAllMocks(...mocks: jest.Mock[]): void {
    mocks.forEach(mock => mock.mockClear());
}
