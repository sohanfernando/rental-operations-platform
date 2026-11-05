import '@fontsource-variable/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { AuthPage } from './auth-page';
import { BookingsPage } from './bookings-page';
import { CatalogPage } from './catalog-page';
import { AboutPage, ContactInboxPage, ContactPage } from './contact-pages';
import { HomePage } from './home-page';
import { InventoryPage } from './inventory-page';
import { Layout } from './layout';
import { NotificationsPage } from './notifications-page';
import { ReservationPage } from './reservation-page';
import { StaffBookingsPage } from './staff-bookings-page';
import './styles.css';

const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    { index: true, element: <HomePage /> },
    { path: 'catalog', element: <CatalogPage /> },
    { path: 'about', element: <AboutPage /> },
    { path: 'contact', element: <ContactPage /> },
    { path: 'equipment/:id', element: <ReservationPage /> },
    { path: 'bookings', element: <BookingsPage /> },
    { path: 'bookings/:id', element: <BookingsPage /> },
    { path: 'notifications', element: <NotificationsPage /> },
    { path: 'login', element: <AuthPage key="login" /> },
    { path: 'register', element: <AuthPage key="register" register /> },
    { path: 'staff/inventory', element: <InventoryPage /> },
    { path: 'staff/contact', element: <ContactInboxPage /> },
    { path: 'staff/bookings', element: <StaffBookingsPage /> },
    { path: 'staff/bookings/:id', element: <StaffBookingsPage /> },
    {
      path: '*',
      element: (
        <main>
          <h1>Page not found</h1>
          <Link to="/catalog">Back to the catalog</Link>
        </main>
      ),
    },
  ],
}]);
const queryClient = new QueryClient();
const root = document.getElementById('root');

if (!root) throw new Error('Missing application root.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
