const clerkJwtIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkJwtIssuerDomain) {
	throw new Error(
		'CLERK_JWT_ISSUER_DOMAIN is required. Set it on the deployment with: npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-frontend-api>'
	);
}

export default {
	providers: [
		{
			domain: clerkJwtIssuerDomain,
			applicationID: 'convex'
		}
	]
};
