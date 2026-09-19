import { supabaseServer } from "./supabase/server";

type PaymentConfig = {
  mpesa_shortcode: string | null;
    mpesa_consumer_key: string | null;
      mpesa_consumer_secret: string | null;
        mpesa_passkey: string | null;
          mpesa_env: "sandbox" | "production";
            mpesa_transaction_type: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
            };

            const DARAJA_HOST: Record<PaymentConfig["mpesa_env"], string> = {
              sandbox: "https://sandbox.safaricom.co.ke",
                production: "https://api.safaricom.co.ke",
                };

                // One OAuth token cache per restaurant -- credentials differ per tenant,
                // so a single module-level token (as sos-caffe used) would leak one
                // restaurant's token into another's requests.
                const tokenCache = new Map<string, { token: string; expiresAt: number }>();

                export async function getPaymentConfig(restaurantId: string): Promise<PaymentConfig | null> {
                  const supabase = supabaseServer();
                    const { data, error } = await supabase
                        .from("restaurant_payment_config")
                            .select(
                                  "mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, mpesa_env, mpesa_transaction_type"
                                      )
                                          .eq("restaurant_id", restaurantId)
                                              .maybeSingle();

                                                if (error || !data) return null;
                                                  return data as PaymentConfig;
                                                  }

                                                  export function isPaymentConfigComplete(config: PaymentConfig | null): config is PaymentConfig {
                                                    return !!(
                                                        config &&
                                                            config.mpesa_shortcode &&
                                                                config.mpesa_consumer_key &&
                                                                    config.mpesa_consumer_secret &&
                                                                        config.mpesa_passkey
                                                                          );
                                                                          }

                                                                          async function getAccessToken(restaurantId: string, config: PaymentConfig): Promise<string> {
                                                                            const cached = tokenCache.get(restaurantId);
                                                                              if (cached && cached.expiresAt > Date.now()) return cached.token;

                                                                                const host = DARAJA_HOST[config.mpesa_env];
                                                                                  const auth = Buffer.from(`${config.mpesa_consumer_key}:${config.mpesa_consumer_secret}`).toString(
                                                                                      "base64"
                                                                                        );

                                                                                          const res = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
                                                                                              headers: { Authorization: `Basic ${auth}` },
                                                                                                });
                                                                                                  if (!res.ok) throw new Error(`Daraja OAuth failed: ${res.status}`);
                                                                                                    const json = await res.json();
                                                                                                    
                                                                                                      const token = json.access_token as string;
                                                                                                        // Daraja tokens last ~1hr; refresh a little early.
                                                                                                          tokenCache.set(restaurantId, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
                                                                                                            return token;
                                                                                                            }
                                                                                                            
                                                                                                            function nairobiTimestamp(): string {
                                                                                                              const now = new Date(
                                                                                                                  new Date().toLocaleString("en-US", { timeZone: "Africa/Nairobi" })
                                                                                                                    );
                                                                                                                      const pad = (n: number) => String(n).padStart(2, "0");
                                                                                                                        return (
                                                                                                                            `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
                                                                                                                                `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
                                                                                                                                  );
                                                                                                                                  }
                                                                                                                                  
                                                                                                                                  function toMsisdn(phone: string): string {
                                                                                                                                    const digits = phone.replace(/\D/g, "");
                                                                                                                                      if (digits.startsWith("254")) return digits;
                                                                                                                                        if (digits.startsWith("0")) return `254${digits.slice(1)}`;
                                                                                                                                          if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
                                                                                                                                            return digits;
                                                                                                                                            }
                                                                                                                                            
                                                                                                                                            export async function initiateStkPush(params: {
                                                                                                                                              restaurantId: string;
                                                                                                                                                config: PaymentConfig;
                                                                                                                                                  phone: string;
                                                                                                                                                    amount: number;
                                                                                                                                                      accountReference: string;
                                                                                                                                                        callbackUrl: string;
                                                                                                                                                        }) {
                                                                                                                                                          const { restaurantId, config, phone, amount, accountReference, callbackUrl } = params;
                                                                                                                                                            const token = await getAccessToken(restaurantId, config);
                                                                                                                                                              const host = DARAJA_HOST[config.mpesa_env];
                                                                                                                                                                const timestamp = nairobiTimestamp();
                                                                                                                                                                  const password = Buffer.from(
                                                                                                                                                                      `${config.mpesa_shortcode}${config.mpesa_passkey}${timestamp}`
                                                                                                                                                                        ).toString("base64");
                                                                                                                                                                        
                                                                                                                                                                          const res = await fetch(`${host}/mpesa/stkpush/v1/processrequest`, {
                                                                                                                                                                              method: "POST",
                                                                                                                                                                                  headers: {
                                                                                                                                                                                        Authorization: `Bearer ${token}`,
                                                                                                                                                                                              "Content-Type": "application/json",
                                                                                                                                                                                                  },
                                                                                                                                                                                                      body: JSON.stringify({
                                                                                                                                                                                                            BusinessShortCode: config.mpesa_shortcode,
                                                                                                                                                                                                                  Password: password,
                                                                                                                                                                                                                        Timestamp: timestamp,
                                                                                                                                                                                                                              TransactionType: config.mpesa_transaction_type,
                                                                                                                                                                                                                                    Amount: Math.round(amount),
                                                                                                                                                                                                                                          PartyA: toMsisdn(phone),
                                                                                                                                                                                                                                                PartyB: config.mpesa_shortcode,
                                                                                                                                                                                                                                                      PhoneNumber: toMsisdn(phone),
                                                                                                                                                                                                                                                            CallBackURL: callbackUrl,
                                                                                                                                                                                                                                                                  AccountReference: accountReference,
                                                                                                                                                                                                                                                                        TransactionDesc: "Order payment",
                                                                                                                                                                                                                                                                            }),
                                                                                                                                                                                                                                                                              });
                                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                const json = await res.json();
                                                                                                                                                                                                                                                                                  if (!res.ok || json.ResponseCode !== "0") {
                                                                                                                                                                                                                                                                                      return {
                                                                                                                                                                                                                                                                                            ok: false as const,
                                                                                                                                                                                                                                                                                                  reason: json.errorMessage || json.ResponseDescription || "Daraja rejected the request",
                                                                                                                                                                                                                                                                                                      };
                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                          return {
                                                                                                                                                                                                                                                                                                              ok: true as const,
                                                                                                                                                                                                                                                                                                                  checkoutRequestId: json.CheckoutRequestID as string,
                                                                                                                                                                                                                                                                                                                      merchantRequestId: json.MerchantRequestID as string,
                                                                                                                                                                                                                                                                                                                        };
                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                        /** Parses the metadata array Safaricom sends on a successful callback. */
                                                                                                                                                                                                                                                                                                                        export function parseCallbackMetadata(items: Array<{ Name: string; Value?: string | number }>) {
                                                                                                                                                                                                                                                                                                                          const find = (name: string) => items.find((i) => i.Name === name)?.Value;
                                                                                                                                                                                                                                                                                                                            return {
                                                                                                                                                                                                                                                                                                                                amount: find("Amount") as number | undefined,
                                                                                                                                                                                                                                                                                                                                    receiptNumber: find("MpesaReceiptNumber") as string | undefined,
                                                                                                                                                                                                                                                                                                                                        phone: find("PhoneNumber") as string | undefined,
                                                                                                                                                                                                                                                                                                                                          };
                                                                                                                                                                                                                                                                                                                                          }
