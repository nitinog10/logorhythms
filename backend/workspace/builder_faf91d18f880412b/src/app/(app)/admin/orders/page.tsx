"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";

interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  rating: number;
  reviews: number;
}

interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  total: number;
  status: string;
  createdAt: Date;
}

const AdminOrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, usersRes, productsRes] = await Promise.all([
          axios.get("/api/orders"),
          axios.get("/api/users"),
          axios.get("/api/products"),
        ]);
        setOrders(ordersRes.data);
        setUsers(usersRes.data);
        setProducts(productsRes.data);
        setLoading(false);
      } catch (err) {
        setError("Failed to fetch data");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleFilterStatus = (status: string) => {
    setFilterStatus(status);
  };

  const handleOpenDrawer = (order: Order) => {
    setSelectedOrder(order);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const filteredOrders = orders.filter((order) => {
    const user = users.find((user) => user.id === order.userId);
    const product = products.find((product) => product.id === order.productId);
    const customerName = user? user.name : "";
    const productName = product? product.name : "";

    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      productName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus
     ? order.status.toLowerCase() === filterStatus.toLowerCase()
      : true;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="font-body-md text-body-md overflow-x-hidden">
      <aside className="bg-inverse-surface dark:bg-surface-container-lowest h-screen w-64 fixed left-0 top-0 flex flex-col p-md shadow-md z-50">
        <div className="mb-lg">
          <h1 className="font-display text-h2 font-bold text-primary-fixed-dim dark:text-primary">
            LUXE
          </h1>
          <p className="text-secondary-fixed-dim font-label-sm uppercase tracking-widest mt-1">
            Admin Console
          </p>
        </div>
        <nav className="flex-1 space-y-2">
          <a
            className="flex items-center gap-3 px-4 py-3 text-secondary-fixed-dim hover:text-secondary-fixed hover:bg-on-secondary-fixed-variant/5 transition-colors rounded-lg"
            href="#"
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-label-md">Dashboard</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 text-primary-fixed-dim font-bold bg-on-secondary-fixed-variant/10 rounded-lg active:scale-[0.98] transition-all duration-150"
            href="#"
          >
            <span className="material-symbols-outlined">shopping_cart</span>
            <span className="font-label-md">Orders</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 text-secondary-fixed-dim hover:text-secondary-fixed hover:bg-on-secondary-fixed-variant/5 transition-colors rounded-lg"
            href="#"
          >
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="font-label-md">Products</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 text-secondary-fixed-dim hover:text-secondary-fixed hover:bg-on-secondary-fixed-variant/5 transition-colors rounded-lg"
            href="#"
          >
            <span className="material-symbols-outlined">group</span>
            <span className="font-label-md">Customers</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 text-secondary-fixed-dim hover:text-secondary-fixed hover:bg-on-secondary-fixed-variant/5 transition-colors rounded-lg"
            href="#"
          >
            <span className="material-symbols-outlined">monitoring</span>
            <span className="font-label-md">Analytics</span>
          </a>
          <a
            className="flex items-center gap-3 px-4 py-3 text-secondary-fixed-dim hover:text-secondary-fixed hover:bg-on-secondary-fixed-variant/5 transition-colors rounded-lg"
            href="#"
          >
            <span className="material-symbols-outlined">settings</span>
            <span className="font-label-md">Settings</span>
          </a>
        </nav>
        <div className="mt-auto pt-md border-t border-white/10 flex items-center gap-3">
          <img
            alt="Admin User Avatar"
            className="w-10 h-10 rounded-full border border-white/20"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBm3-3kxgpYo2Zn_OjOqtUBgX3rAFOD4Vtjk7hBpu8GCPKDyEjBaXd9-13-ttFWsjxSUBw6Rj03X0KUmwbC3lkWA45VRfthozaTIDZIweIzjHVtskLDpqdTNp2qbDbSCxfk5iJSsaTYUP0nn6KYDs2kIFrOzj4CZgh357LqEIneHzm9hXG5vaFZpxQQXDjwYIswCg8NwdW4RuSPrGd1xsvsEFAyhgS3C_g5aYsMp-y7e9tZeTf8RdSqe_7TzkLYOla6aMqHtG5sGPGs"
          />
          <div>
            <p className="text-on-primary font-label-md">Alex Sterling</p>
            <p className="text-secondary-fixed-dim text-xs">Super Admin</p>
          </div>
        </div>
      </aside>
      <header className="flex justify-between items-center h-xl px-md w-[calc(100%-16rem)] ml-auto bg-surface-bright dark:bg-surface-dim border-b border-outline-variant dark:border-outline sticky top-0 z-40">
        <div className="flex items-center gap-md w-1/3">
          <div className="relative w-full max-w-sm focus-within:ring-2 focus-within:ring-primary rounded-lg transition-all">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
              search
            </span>
            <input
              className="w-full bg-surface-container-low border-none rounded-lg py-2 pl-10 pr-4 text-body-sm focus:ring-0"
              placeholder="Search orders, customers..."
              type="text"
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <button className="p-2 text-on-surface-variant hover:bg-surface-container-low transition-all rounded-full relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full"></span>
          </button>
          <button className="p-2 text-on-surface-variant hover:bg-surface-container-low transition-all rounded-full">
            <span className="material-symbols-outlined">help</span>
          </button>
          <div className="h-6 w-[1px] bg-outline-variant mx-2"></div>
          <span className="font-h2 text-h2 font-black text-on-surface dark:text-on-surface-variant">
            LUXE Admin
          </span>
        </div>
      </header>
      <main className="ml-64 p-md min-h-screen">
        <div className="max-w-container-max mx-auto space-y-md">
          <section className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
            <div className="bg-surface-container-lowest p-md rounded-xl ambient-shadow border border-outline-variant/30">
              <div className="flex justify-between items-start mb-base">
                <span className="material-symbols-outlined text-primary bg-primary-container/20 p-2 rounded-lg">
                  shopping_bag
                </span>
                <span className="text-label-sm text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  +12%
                </span>
              </div>
              <p className="text-on-surface-variant font-label-md">
                Total Orders
              </p>
              <h2 className="font-h1 text-h1 mt-1">2,450</h2>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-xl ambient-shadow border border-outline-variant/30">
              <div className="flex justify-between items-start mb-base">
                <span className="material-symbols-outlined text-secondary bg-secondary-container/30 p-2 rounded-lg">
                  pending_actions
                </span>
              </div>
              <p className="text-on-surface-variant font-label-md">Pending</p>
              <h2 className="font-h1 text-h1 mt-1">124</h2>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-xl ambient-shadow border border-outline-variant/30">
              <div className="flex justify-between items-start mb-base">
                <span className="material-symbols-outlined text-primary bg-primary-container/20 p-2 rounded-lg">
                  local_shipping
                </span>
              </div>
              <p className="text-on-surface-variant font-label-md">Shipped</p>
              <h2 className="font-h1 text-h1 mt-1">850</h2>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-xl ambient-shadow border border-outline-variant/30">
              <div className="flex justify-between items-start mb-base">
                <span className="material-symbols-outlined text-green-700 bg-green-100 p-2 rounded-lg">
                  check_circle
                </span>
              </div>
              <p className="text-on-surface-variant font-label-md">
                Delivered
              </p>
              <h2 className="font-h1 text-h1 mt-1">1,476</h2>
            </div>
          </section>
          <section className="flex flex-col md:flex-row gap-base items-center justify-between bg-surface-container-lowest p-sm rounded-xl ambient-shadow">
            <div className="flex items-center gap-sm overflow-x-auto w-full md:w-auto">
              <button
                className="px-md py-2 bg-primary-container text-on-primary-container font-label-md rounded-lg whitespace-nowrap"
                onClick={() => handleFilterStatus("")}
              >
                All Orders
              </button>
              <button
                className="px-md py-2 text-on-surface-variant hover:bg-surface-container-low font-label-md rounded-lg whitespace-nowrap"
                onClick={() => handleFilterStatus("pending")}
              >
                Pending
              </button>
              <button
                className="px-md py-2 text-on-surface-variant hover:bg-surface-container-low font-label-md rounded-lg whitespace-nowrap"
                onClick={() => handleFilterStatus("shipped")}
              >
                Shipped
              </button>
              <button
                className="px-md py-2 text-on-surface-variant hover:bg-surface-container-low font-label-md rounded-lg whitespace-nowrap"
                onClick={() => handleFilterStatus("delivered")}
              >
                Delivered
              </button>
              <button
                className="px-md py-2 text-on-surface-variant hover:bg-surface-container-low font-label-md rounded-lg whitespace-nowrap"
                onClick={() => handleFilterStatus("cancelled")}
              >
                Cancelled
              </button>
            </div>
            <div className="flex items-center gap-sm w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-body-sm">
                  calendar_today
                </span>
                <input
                  className="w-full text-body-sm pl-10 pr-4 py-2 border-outline-variant rounded-lg focus:border-primary-container focus:ring-primary-container"
                  type="text"
                  value="Oct 20 - Oct 27, 2023"
                />
              </div>
              <button className="flex items-center gap-2 px-md py-2 border-1.5 border-on-background/10 bg-white hover:bg-surface-container-low transition-colors rounded-lg font-label-md">
                <span className="material-symbols-outlined text-body-sm">
                  filter_list
                </span>
                More
              </button>
            </div>
          </section>
          <section className="bg-surface-container-lowest rounded-xl ambient-shadow overflow-hidden border border-outline-variant/30">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Items
                  </th>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Total
                  </th>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Status
                  </th>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Date
                  </th>
                  <th className="p-md font-label-md text-on-surface-variant uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer"
                    onClick={() => handleOpenDrawer(order)}
                  >
                    <td className="p-md font-label-md text-on-surface">
                      {order.id}
                    </td>
                    <td className="p-md">
                      <div className="flex items-center gap-base">
                        <img
                          alt="Customer Portrait"
                          className="w-8 h-8 rounded-full"
                          src={`https://lh3.googleusercontent.com/aida-public/AB6AXuDkiuVBqA1LusR0DQcq_gp3_5L4hik-9V8JyEhYSEZvqgQtynoc8b4xElaehRWGSg8ucaCEKT_UeAj06ogOSZQ9FCKhgTuWFz0pSKYv0qQHRFX8EBnbZa5kjkV6xV-VefwCBfzMdPmI08JIRucMrEeP3MkUxcn6oQh5-UqCiIA4HZ5WJql8P-Ah05N2DgmB5bCCmvey0KKFopwLOxkDHI3pQnVEE7FF3H46URVfVp3WEhoR-BbwUuNxVlZc0E5iLS_jlVlqEBR7DXUg`}
                        />
                        <span className="font-body-md font-medium">
                          {users.find((user) => user.id === order.userId)?.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-md text-on-surface-variant text-body-sm">
                      {products
                       .filter((product) => product.id === order.productId)
                       .map((product) => product.name)
                       .join(", ")}
                    </td>
                    <td className="p-md font-h3 text-h3">${order.total.toFixed(2)}</td>
                    <td className="p-md">
                      <span
                        className={`px-3 py-1 rounded-full ${
                          order.status === "delivered"
                           ? "bg-green-100 text-green-700"
                            : order.status === "shipped"
                           ? "bg-primary-container/20 text-on-primary-container"
                            : "bg-secondary-container text-on-secondary-container"
                        } font-label-sm`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="p-md text-on-surface-variant text-body-sm">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-md">
                      <span className="material-symbols-outlined text-outline">
                        chevron_right
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-md bg-surface-container-low flex justify-between items-center">
              <p className="text-body-sm text-on-surface-variant">
                Showing 1 to 10 of 2,450 results
              </p>
              <div className="flex gap-2">
                <button className="px-3 py-1 border border-outline-variant rounded hover:bg-white transition-colors">
                  <span className="material-symbols-outlined text-xs">
                    chevron_left
                  </span>
                </button>
                <button className="px-3 py-1 border border-outline-variant rounded bg-primary text-on-primary">
                  1
                </button>
                <button className="px-3 py-1 border border-outline-variant rounded hover:bg-white transition-colors">
                  2
                </button>
                <button className="px-3 py-1 border border-outline-variant rounded hover:bg-white transition-colors">
                  3
                </button>
                <button className="px-3 py-1 border border-outline-variant rounded hover:bg-white transition-colors">
                  <span className="material-symbols-outlined text-xs">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
      {isDrawerOpen && selectedOrder && (
        <aside className="fixed right-0 top-0 h-screen w-[480px] bg-white z-[60] drawer-shadow flex flex-col transform translate-x-0 transition-transform duration-300">
          <div className="p-md border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low">
            <div>
              <h3 className="font-h3 text-h3">Order #{selectedOrder.id}</h3>
              <p className="text-body-sm text-on-surface-variant">
                Placed on {new Date(selectedOrder.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              className="p-2 hover:bg-white/50 rounded-full transition-colors"
              onClick={handleCloseDrawer}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-md space-y-lg">
            <section className="space-y-sm">
              <h4 className="font-label-md text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/20 pb-2">
                Customer Details
              </h4>
              <div className="flex items-center gap-md">
                <img
                  alt="Customer Portrait"
                  className="w-12 h-12 rounded-xl"
                  src={`https://lh3.googleusercontent.com/aida-public/AB6AXuBQyxcffw-TTTuqLDGvbjnQKvS8RzcjqHRvjAnTAfu4W5qWT_Bc4kSDfgIr_KwT9e2pLs_DSXvDnB39Iy-cI-y70I7QWEDI2mJo_V3ZvzufD4aVN_wYxTnz_fliyNsNeeujDHGOwBKYD99xmFtYz7TmelM3PyftI-p4cdJ98t25LPO_QZcQwjZaz7je5LJrVbn0yJDzsG4nybQ-dhlEhzrzthSvHdUTN5YvKSxmAU2RWDHl7ldhZEdLEw2A424gSms-JEzyJNpG6Ot-`}
                />
                <div>
                  <p className="font-body-lg font-bold">
                    {users.find((user) => user.id === selectedOrder.userId)?.name}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {users.find((user) => user.id === selectedOrder.userId)?.email}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    +1 (555) 012-3456
                  </p>
                </div>
              </div>
            </section>
            <section className="space-y-sm">
              <h4 className="font-label-md text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/20 pb-2">
                Order Summary
              </h4>
              <div className="space-y-md">
                {products
                 .filter((product) => product.id === selectedOrder.productId)
                 .map((product) => (
                    <div key={product.id} className="flex gap-md">
                      <div className="w-20 h-20 bg-surface-container rounded-lg flex-shrink-0 overflow-hidden">
                        <img
                          className="w-full h-full object-cover"
                          src={product.imageUrl}
                          alt={product.name}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-label-md">{product.name}</p>
                        <p className="text-body-sm text-on-surface-variant">
                          {product.description}
                        </p>
                        <div className="flex justify-between items-end mt-2">
                          <span className="text-body-sm">
                            Qty: {selectedOrder.quantity}
                          </span>
                          <span className="font-h3 text-h3">
                            ${product.price.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                <div className="pt-md border-t border-outline-variant/20 space-y-base">
                  <div className="flex justify-between text-body-sm">
                    <span>Subtotal</span>
                    <span>${selectedOrder.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-body-sm">
                    <span>Shipping</span>
                    <span className="text-green-600">Free</span>
                  </div>
                  <div className="flex justify-between font-h2 text-h2 pt-base">
                    <span>Total</span>
                    <span>${selectedOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="space-y-sm">
              <h4 className="font-label-md text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/20 pb-2">
                Shipping Address
              </h4>
              <div className="p-md bg-surface-container-low rounded-lg">
                <p className="font-body-md">742 Evergreen Terrace</p>
                <p className="text-body-sm text-on-surface-variant">
                  Springfield, OR 97403
                </p>
                <p className="text-body-sm text-on-surface-variant">
                  United States
                </p>
              </div>
            </section>
            <section className="space-y-sm">
              <h4 className="font-label-md text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/20 pb-2">
                Order Timeline
              </h4>
              <div className="space-y-md relative before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-outline-variant/30">
                <div className="flex gap-md relative">
                  <div className="w-6 h-6 rounded-full bg-green-500 border-4 border-white z-10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check
                    </span>
                  </div>
                  <div>
                    <p className="font-label-md">Delivered</p>
                    <p className="text-xs text-on-surface-variant">
                      Oct 26, 2023 at 10:12 AM
                    </p>
                  </div>
                </div>
                <div className="flex gap-md relative">
                  <div className="w-6 h-6 rounded-full bg-primary border-4 border-white z-10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      local_shipping
                    </span>
                  </div>
                  <div>
                    <p className="font-label-md">Shipped from Warehouse</p>
                    <p className="text-xs text-on-surface-variant">
                      Oct 25, 2023 at 09:00 AM
                    </p>
                  </div>
                </div>
                <div className="flex gap-md relative">
                  <div className="w-6 h-6 rounded-full bg-outline z-10 flex items-center justify-center"></div>
                  <div>
                    <p className="font-label-md text-on-surface-variant">
                      Order Confirmed
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Oct 24, 2023 at 02:45 PM
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div className="p-md bg-surface-container-low border-t border-outline-variant/30 flex gap-sm">
            <button className="flex-1 py-3 px-md bg-primary-container text-on-primary-container font-label-md rounded-lg hover:brightness-95 transition-all">
              Download Invoice
            </button>
            <button className="py-3 px-md border-1.5 border-outline rounded-lg font-label-md hover:bg-white transition-colors">
              Manage Order
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};

export default AdminOrdersPage;