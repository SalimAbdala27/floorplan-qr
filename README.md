# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

## Stripe subscriptions

This app now supports PDF export gating in the frontend:

- signed-out users see the auth screen
- signed-in users can still use the app normally
- signed-in users without an active subscription are prompted to subscribe when they try to export a PDF
- signed-in users with `active` or `trialing` status in `public.user_subscriptions` can export PDFs

### Supabase setup

Run:

- `supabase/user_home_configs.sql`
- `supabase/user_subscriptions.sql`

### Frontend environment variables

Add these to your frontend environment:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

### Supabase Edge Function setup

This repo now includes a public-ready Stripe flow using Supabase Edge Functions:

- `supabase/functions/create-checkout-session`
- `supabase/functions/create-customer-portal`
- `supabase/functions/cancel-subscription`
- `supabase/functions/stripe-webhook`

Run the SQL first:

1. `supabase/user_home_configs.sql`
2. `supabase/user_subscriptions.sql`

Set these Supabase project secrets for Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `STRIPE_PRICE_ID`
- `APP_URL`

Deploy the functions:

1. `supabase functions deploy create-checkout-session`
2. `supabase functions deploy create-customer-portal`
3. `supabase functions deploy cancel-subscription`
4. `supabase functions deploy stripe-webhook`

Create a Stripe webhook endpoint that points to:

- `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`

Subscribe that webhook to at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Production flow:

1. User signs in with Supabase.
2. Frontend calls `create-checkout-session`.
3. Stripe Checkout creates or updates the subscription.
4. Stripe sends webhook events to `stripe-webhook`.
5. The webhook updates `public.user_subscriptions`.
6. The app unlocks PDF export only when the stored status is `active` or `trialing`.

If you let customers cancel in the Stripe portal or with the in-app cancel button, configure cancellation to happen at period end so they keep access until `current_period_end`.

### Manual fallback

The manual SQL helpers are still in `supabase/` if you want to test without Stripe automation, but they should not be the main public billing workflow.

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
