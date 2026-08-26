// apps/web/src/__tests__/LoginPage.test.tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { LoginPage } from '../pages/LoginPage';

describe('LoginPage', () => {
  it('renders a Sign in with SSO link pointing at the backend OIDC login route', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /sign in with sso/i });
    expect(link).toHaveAttribute('href', 'http://localhost:3001/auth/oidc/login');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<LoginPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
