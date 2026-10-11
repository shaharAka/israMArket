"""Fictional analytics cases shared by offline checks and the opt-in model evaluation."""
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.jsonutil import dumps


def scenarios():
    today = date.today()
    period = {"start": (today - timedelta(days=28)).isoformat(), "end": (today - timedelta(days=1)).isoformat()}
    stamp = datetime.now(timezone.utc).isoformat()
    def business(segment, name, offer, metric, owner_report=None):
        row = SimpleNamespace(id=101, name=name, business_model='services' if segment == 'services' else 'products',
            offerings=offer, primary_goal=metric, monthly_budget_ils=1000, integrations=[], service_reports=[])
        row.scraped_profile_json = dumps({'owner_context': {'research_journey': {
            'segment': segment, 'metric': metric, 'answers': {'offerings': offer,
                'audiences': ['לקוחות מקומיים'], 'differentiator': 'שירות אישי ומוצרים שנבחרו בקפידה'}}}})
        if owner_report:
            row.service_reports.append(SimpleNamespace(id=1, month=today.strftime('%Y-%m'), revision=1,
                updated_at=datetime.utcnow(), **owner_report))
        return row

    def google(row, events, sessions=1000):
        row.integrations.append(SimpleNamespace(provider='ga4', external_id='123', status='connected'))
        return {'property_id': '123', 'read_at': stamp, 'period': period,
            'overview': {'sessions': str(sessions)},
            'events': [{'eventName': k, 'eventCount': str(v)} for k, v in events.items()],
            'report_reads': {'overview': {'status': 'available'}, 'events': {'status': 'available', 'limited': False}}}

    def social(row, reach=2000):
        row.integrations.append(SimpleNamespace(provider='meta', external_id='page_1', status='connected', extra_json=dumps({})))
        return {'source_read_at': stamp, 'source_period': period,
            'account': {'windows': {'28': {'current': {**period, 'values': {'reach': reach, 'total_interactions': 150}}}}},
            'posts': [{'id': 'own_post_1', 'caption': 'עיצוב ושיפוץ דירות קטנות בחיפה',
                'insights': {'reach': reach, 'saved': 90, 'shares': 20}}]}

    cases = []
    shop = business('online_shop', 'בדיקת חנות בגדים', 'בגדי פשתן לנשים בחנות מקוונת', 'purchases')
    cases.append(('shop_checkout', shop, google(shop, {'view_item': 600, 'add_to_cart': 120, 'begin_checkout': 60, 'purchase': 6}), {},
        'Prioritize a checkout/offer check; no abandoned-cart rate or verified paid-order claim from aggregate event counts.'))
    designer = business('services', 'בדיקת מעצבת פנים', 'עיצוב ושיפוץ דירות קטנות בחיפה', 'suitable_inquiries',
        {'inquiries': 20, 'suitable': 2, 'clients_won': 1, 'capacity': 2, 'fit_criterion': 'פרויקט מלא בדירה קטנה בחיפה'})
    cases.append(('designer_inquiry_fit', designer, google(designer, {'generate_lead': 18}, 80), social(designer),
        'Explain who the service fits and measure suitable inquiries; do not attribute owner results to the social post or infer a close rate.'))
    adshop = business('online_shop', 'בדיקת מודעות לחנות', 'בגדי פשתן לנשים בחנות מקוונת', 'purchases')
    adshop.integrations.append(SimpleNamespace(provider='meta', external_id='', status='connected',
        extra_json=dumps({'selected_ad_account_id': 'act_123'})))
    ads = {'source_read_at': stamp, 'source_period': period, 'tracking': {'status': 'receiving',
        'server_delivery': None, 'deduplication': None, 'purchase_value_currency': None},
        'ads': {'status': 'available', 'account_id': 'act_123', 'period': period, 'overview': {
            'currency': 'ILS', 'spend': 1000, 'link_clicks': 1000, 'website_purchases': 2,
            'website_purchase_value': 240, 'cost_per_link_click': 1, 'cost_per_purchase': 500, 'purchase_roas': .24},
            'attribution': {'action_attribution_windows': ['7d_click', '1d_view'], 'action_report_time': 'conversion'}}}
    cases.append(('ads_cheap_clicks', adshop, {}, ads,
        'Judge attributed purchase efficiency rather than cheap clicks; no verified profit, source summation or automatic budget change.'))
    unknown = business('online_shop', 'בדיקת מדידה חסרה', 'בגדי פשתן לנשים בחנות מקוונת', 'purchases')
    unknown_ga = google(unknown, {}, 400)
    unknown_ga['report_reads']['events'] = {'status': 'unavailable'}
    cases.append(('tracking_incomplete', unknown, unknown_ga, {},
        'Check purchase-event measurement before sales advice; missing purchases are unknown, not zero.'))

    return cases


def prepared_case(index, case):
    from app.services import marketing_outcome, recommendation_context, service_results
    name, row, ga, meta, expected = case
    plan = {"id": 1, "goal": row.primary_goal, "roadmap": {"posts": [{
        "uid": "draft-1", "title": "למי ההצעה מתאימה", "caption": "הצגת השירות או המוצר לקהל המתאים",
        "channel": "instagram", "primary_outlet": "instagram", "approval_status": "draft", "published_at": None}]}}
    period = ga.get("period") or meta.get("source_period") or {}
    stamp = ga.get("read_at") or meta.get("source_read_at")
    snapshot = {"id": index + 1, "created_at": stamp, "period_start": period.get("start"),
        "period_end": period.get("end"), "ga4": ga, "meta": meta}
    clean_ga, clean_meta, basis = recommendation_context.prepare(row, plan, snapshot)
    payload = {"name": row.name, "business_model": row.business_model, "offerings": row.offerings,
        "primary_goal": row.primary_goal, "monthly_budget_ils": row.monthly_budget_ils,
        "analysis_basis": basis, **marketing_outcome.context(row), **service_results.model_context(row)}
    return {"case": name, "expected": expected, "inputs": {"business": payload,
        "ga4": clean_ga, "meta": clean_meta, "plan": plan}}
