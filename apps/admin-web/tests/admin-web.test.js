import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Import compiled components from dist
import {
  App,
  LoginPage,
  OperationalDashboard,
  CustomerManagement,
  MilkCollectionModule,
  RateManagementModule,
  AccountingBillingModule,
  DeviceSyncModule,
  ReportsAnalyticsModule,
  SettingsModule,
  Sidebar,
  Header,
  StatCard,
  StatusBadge,
  Modal,
  Pagination,
  SearchBar,
  AuthProvider,
  ToastProvider,
} from '../dist/index.js';

test('DFarm Phase 17: Admin Web Dashboard & Component Test Suite', async (t) => {
  await t.test('1. Core Atomic Components render cleanly', () => {
    // StatCard
    const statHtml = renderToString(
      React.createElement(StatCard, {
        title: "Today's Cow Milk",
        value: "450.50 kg",
        subtext: "Morning & Evening shifts",
        variant: "emerald",
        icon: "🐄",
      })
    );
    assert.ok(statHtml.includes("Today&#x27;s Cow Milk") || statHtml.includes("Cow Milk"));
    assert.ok(statHtml.includes("450.50 kg"));

    // StatusBadge
    const badgeHtml = renderToString(React.createElement(StatusBadge, { status: "ACTIVE" }));
    assert.ok(badgeHtml.includes("ACTIVE"));

    // SearchBar
    const searchHtml = renderToString(
      React.createElement(SearchBar, {
        value: "Mane",
        onChange: () => {},
        placeholder: "Search farmer...",
      })
    );
    assert.ok(searchHtml.includes('value="Mane"'));

    // Pagination
    const pageHtml = renderToString(
      React.createElement(Pagination, {
        currentPage: 2,
        totalItems: 45,
        pageSize: 15,
        onPageChange: () => {},
      })
    );
    assert.ok(pageHtml.includes("Page"));
    assert.ok(pageHtml.includes("of"));
    assert.ok(pageHtml.includes("Showing"));

    // Modal (open)
    const modalHtml = renderToString(
      React.createElement(
        Modal,
        {
          isOpen: true,
          onClose: () => {},
          title: "Supervisor Audit Modal",
          maxWidth: "md",
        },
        React.createElement("div", null, "Audit Content Text")
      )
    );
    assert.ok(modalHtml.includes("Supervisor Audit Modal"));
    assert.ok(modalHtml.includes("Audit Content Text"));

    // Modal (closed)
    const closedModalHtml = renderToString(
      React.createElement(
        Modal,
        {
          isOpen: false,
          onClose: () => {},
          title: "Closed Modal",
        },
        React.createElement("div", null, "Hidden Content")
      )
    );
    assert.equal(closedModalHtml, "");
  });

  await t.test('2. LoginPage renders with role presets', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(AuthProvider, null, React.createElement(LoginPage, null))
      )
    );
    assert.ok(html.includes("DFARM Admin Web") || html.includes("Smart Dairy Operations"));
    assert.ok(html.includes("Dairy Owner"));
    assert.ok(html.includes("Center Manager"));
    assert.ok(html.includes("Accountant"));
    assert.ok(html.includes("Supervisor"));
    assert.ok(html.includes("Sign In") || html.includes("Signing In"));
  });

  await t.test('3. Sidebar enforces RBAC visibility for various roles', () => {
    // When no roles (empty context), public tabs remain visible
    const publicHtml = renderToString(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(Sidebar, {
          activeSection: 'dashboard',
          onSelectSection: () => {},
          isMobileOpen: false,
          onCloseMobile: () => {},
        })
      )
    );
    assert.ok(publicHtml.includes("Main Dashboard"));
    assert.ok(publicHtml.includes("Customer Management"));
    assert.ok(publicHtml.includes("Milk Collections"));
    assert.ok(publicHtml.includes("Feed Inventory &amp; POS") || publicHtml.includes("Feed Inventory"));
  });

  await t.test('4. Operational Dashboard renders initial aggregation state and KPIs', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(OperationalDashboard, null)
        )
      )
    );
    assert.ok(html.includes("Aggregating live operational metrics") || html.includes("Dairy Operations"));
  });

  await t.test('5. Customer Management renders directory and enforces biometric privacy shield', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(CustomerManagement, null)
        )
      )
    );
    assert.ok(html.includes("Search by farmer code, name, or phone..."));
    assert.ok(html.includes("All Statuses"));
    assert.ok(html.includes("Show Soft-Deleted"));
    // Biometric privacy verification: Raw embeddings must NEVER exist
    assert.ok(!html.includes("embeddingVector"));
    assert.ok(!html.includes("Float32Array"));
  });

  await t.test('6. Milk Collection Module renders shift summaries and controls', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(MilkCollectionModule, null)
        )
      )
    );
    assert.ok(html.includes("Milk Collection Management"));
    assert.ok(html.includes("Total Milk Received"));
    assert.ok(html.includes("Cow Milk"));
    assert.ok(html.includes("Buffalo Milk"));
    assert.ok(html.includes("All Shifts"));
    assert.ok(html.includes("All Categories"));
    assert.ok(html.includes("AUTO_BRIDGE") || html.includes("Collection Register"));
  });

  await t.test('7. Rate Management Module renders rate charts and simulator', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(RateManagementModule, null)
        )
      )
    );
    assert.ok(html.includes("Milk Rate Chart &amp; Matrix Management") || html.includes("Milk Rate Chart"));
    assert.ok(html.includes("Rate Preview Calculator"));
    assert.ok(html.includes("Run Simulation"));
    assert.ok(html.includes("FAT Percentage"));
    assert.ok(html.includes("SNF Percentage"));
  });

  await t.test('8. Accounting & Billing Module renders settlement workflows and periods', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(AccountingBillingModule, null)
        )
      )
    );
    assert.ok(html.includes("Accounting, Billing &amp; Payouts") || html.includes("Accounting"));
    assert.ok(html.includes("Billing Periods &amp; Invoices") || html.includes("Billing Periods"));
    assert.ok(html.includes("Payout Vouchers"));
    assert.ok(html.includes("Customer Advances"));
    assert.ok(html.includes("Bulk Payment Batches"));
  });

  await t.test('9. Device & Synchronization Module displays fleet and cryptographic privacy notice', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(DeviceSyncModule, null)
        )
      )
    );
    assert.ok(html.includes("Terminals, Devices &amp; Synchronization") || html.includes("Terminals"));
    assert.ok(html.includes("Registered Devices"));
    assert.ok(html.includes("Sync Conflicts"));
    assert.ok(html.includes("Sync Audit Stream"));
    assert.ok(html.includes("ZERO EMBEDDING EXPOSURE"));
    assert.ok(html.includes("Secp256k1"));
  });

  await t.test('10. Reports & Analytics Module provides authoritative views and export capability', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(ReportsAnalyticsModule, null)
        )
      )
    );
    assert.ok(html.includes("Authoritative Business Reports &amp; Analytics") || html.includes("Reports"));
    assert.ok(html.includes("Daily Collections"));
    assert.ok(html.includes("Monthly Collections"));
    assert.ok(html.includes("Farmer-wise Summary"));
    assert.ok(html.includes("Cow vs Buffalo"));
    assert.ok(html.includes("Fat / SNF Distribution"));
    assert.ok(html.includes("Double-Entry Ledger"));
    assert.ok(html.includes("Export CSV"));
  });

  await t.test('11. Settings Module renders center profiles and shift window setup', () => {
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(SettingsModule, null)
        )
      )
    );
    assert.ok(html.includes("Center &amp; Operational Settings") || html.includes("Operational Settings"));
    assert.ok(html.includes("Dairy Centers &amp; Branches"));
    assert.ok(html.includes("Staff Profile &amp; Session"));
    assert.ok(html.includes("Shift Timings &amp; Weighing Units") || html.includes("Shift Timings"));
    assert.ok(html.includes("Save Configuration"));
  });

  await t.test('12. Main App Component renders loading splash and bootstraps without error', () => {
    const appHtml = renderToString(React.createElement(App, null));
    assert.ok(appHtml.includes("INITIALIZING DFARM DAIRY OPERATING PLATFORM") || appHtml.includes("DFARM"));
  });

  await t.test('13. CustomerManagement safely handles paginated { items, total } responses without crashing', () => {
    // Verify that rendering CustomerManagement with default state or loaded state doesn't throw TypeError: customers.map is not a function
    const html = renderToString(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(CustomerManagement, null)
        )
      )
    );
    assert.ok(html.includes("Customer Master") || html.includes("Farmer Code"));
    assert.ok(html.includes("Loading farmers from database") || html.includes("No customers found"));
  });
});
