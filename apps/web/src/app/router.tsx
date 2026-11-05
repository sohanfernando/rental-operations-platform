import { createBrowserRouter, Link } from 'react-router';
import { AuthPage } from '../features/auth/auth-page';
import { BookingsPage } from '../features/bookings/bookings-page';
import { ReservationPage } from '../features/bookings/reservation-page';
import { StaffBookingsPage } from '../features/bookings/staff-bookings-page';
import { CatalogPage } from '../features/catalog/catalog-page';
import { ContactInboxPage, ContactPage } from '../features/contact/contact-pages';
import { InventoryPage } from '../features/inventory/inventory-page';
import { NotificationsPage } from '../features/notifications/notifications-page';
import { AboutPage } from '../features/site/about-page';
import { HomePage } from '../features/site/home-page';
import { Layout } from './layout';

export const router = createBrowserRouter([{
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
