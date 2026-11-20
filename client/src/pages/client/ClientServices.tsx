import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, X } from 'lucide-react';
import type { ServiceCatalogItem } from '../../../../shared/free-services';
import { clientApi, formatPublicError, PublicApiError } from '../../lib/public-api';
import { ClientPageHeader } from '../../components/ClientLayout';
import { EmptyState, ErrorState, Field, Select, Spinner, Textarea } from '../../components/ui';

export default function ClientServices() {
  const [params] = useSearchParams();
  const preselected = params.get('service');
  const [items, setItems] = useState<ServiceCatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ServiceCatalogItem | null>(null);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState<'email' | 'phone' | 'whatsapp'>('email');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    setError(null);
    clientApi<{ items: ServiceCatalogItem[] }>('/services')
      .then((response) => {
        setItems(response.items);
        if (preselected) {
          const item = response.items.find((service) => service.key === preselected);
          if (item) setActive(item);
        }
      })
      .catch((err) => setError(formatPublicError(err)));
  };

  useEffect(load, [preselected]);

  const groups = useMemo(() => {
    const map = new Map<string, ServiceCatalogItem[]>();
    for (const item of items ?? []) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [items]);

  const open = (service: ServiceCatalogItem) => {
    setActive(service);
    setFormError(null);
    setSuccess(null);
    setMessage('');
    setContact('email');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!active) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await clientApi('/requests', {
        method: 'POST',
        body: { serviceKey: active.key, message, contactPreference: contact },
      });
      setSuccess(`Your request for ${active.name} was sent. We will contact you soon.`);
      setActive(null);
    } catch (err) {
      if (err instanceof PublicApiError && err.status === 409) {
        setFormError('You already have an open request for this service.');
      } else {
        setFormError(formatPublicError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!items && !error) return <Spinner label="Loading service catalogue" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <ClientPageHeader
        title="Services"
        subtitle="Choose the work that matches your concern. Sending a request does not commit you to an engagement."
        actions={
          <Link to="/client/requests" className="text-sm font-medium text-blue-600">
            View my requests
          </Link>
        }
      />

      {success && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {success}{' '}
            <Link to="/client/requests" className="font-medium underline">
              View request
            </Link>
          </span>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="No services available"
          description="The service catalogue is empty. Please try again later."
        />
      ) : (
        <div className="space-y-7">
          {groups.map(([category, services]) => (
            <section key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {category}
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {services.map((service) => (
                  <div
                    key={service.key}
                    className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{service.name}</h3>
                      {service.isFree && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                          Free
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-600">{service.tagline}</p>
                    <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">
                      {service.description}
                    </p>
                    {service.isFree ? (
                      <Link
                        to={`/free/${service.key}`}
                        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        Open free check <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => open(service)}
                        className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        Request this service <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy-950/50 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Service request
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{active.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4 px-5 py-4">
              {formError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </p>
              )}
              <Field label="What would you like help with?" htmlFor="request-message">
                <Textarea
                  id="request-message"
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={2000}
                  placeholder="A short description of the concern, system or deadline."
                />
              </Field>
              <Field label="Preferred contact method" htmlFor="contact-preference">
                <Select
                  id="contact-preference"
                  value={contact}
                  onChange={(event) =>
                    setContact(event.target.value as 'email' | 'phone' | 'whatsapp')
                  }
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                </Select>
              </Field>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Sending' : 'Send request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
