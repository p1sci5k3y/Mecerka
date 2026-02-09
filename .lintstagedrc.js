module.exports = {
    // Backend: Lint + Type Check
    'backend/**/*.{ts,js,json}': [
        () => 'npm run lint --prefix backend',
        () => 'npm run type-check --prefix backend'
    ],
    // Frontend: Lint + Type Check
    'frontend/**/*.{ts,tsx,js,jsx,json}': [
        () => 'npm run lint --prefix frontend',
        () => 'npm run type-check --prefix frontend'
    ]
}
