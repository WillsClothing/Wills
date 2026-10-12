import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import ShopLayout from './components/ShopLayout';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import NotFound from './pages/NotFound';

// The admin portal is loaded only when visited, keeping the shop fast for customers.
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const AdminProducts = lazy(() => import('./admin/AdminProducts'));
const ProductEditor = lazy(() => import('./admin/ProductEditor'));
const Inventory = lazy(() => import('./admin/Inventory'));
const Settings = lazy(() => import('./admin/Settings'));

export default function App() {
  return (
    <Suspense fallback={<div className="login-wrap">Loading…</div>}>
      <Routes>
        <Route element={<ShopLayout />}>
          <Route index element={<Shop />} />
          <Route path="product/:id" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminProducts />} />
          <Route path="products/new" element={<ProductEditor />} />
          <Route path="products/:id" element={<ProductEditor />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
