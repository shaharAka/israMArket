"""Recovered copy must never silently overwrite another editor's saved caption."""
import _test_env  # noqa: F401

from unittest import mock

from app.services import image_jobs
from app.services.jsonutil import dumps, loads
from test_post_rewrite import RewriteTestCase, post


class CaptionConflictTest(RewriteTestCase):
    def save(self, **overrides):
        return self.client.post('/strategy/posts/save', json={
            'post_index': 0, 'title': 'Workshop', 'format': 'image',
            'primary_outlet': 'instagram', 'caption': 'My recovered wording', **overrides,
        })

    def test_conflict_preserves_saved_copy_and_other_posts(self):
        original = post(caption='Saved elsewhere', outlet_captions={'instagram': 'Saved elsewhere'})
        strategy = self.month(original, post(uid='bbbbbbbbb2', caption='Other post'))
        response = self.save(expected_caption='Old copy')
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()['detail']['code'], 'caption_conflict')
        self.assertEqual(self.stored(strategy)['caption'], 'Saved elsewhere')
        self.assertEqual(self.stored(strategy, 1)['caption'], 'Other post')

    def test_matching_expected_outlet_saves_and_explicit_rebase_can_save(self):
        strategy = self.month(post(caption='Primary', outlet_captions={'instagram': 'Outlet copy'}))
        response = self.save(expected_caption='Outlet copy')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stored(strategy)['caption'], 'My recovered wording')
        self.assertEqual(self.stored(strategy)['outlet_captions']['instagram'], 'My recovered wording')
        self.assertEqual(self.save(expected_caption='My recovered wording', caption='Reviewed both').status_code, 200)

    def test_compare_runs_against_locked_current_not_request_snapshot(self):
        strategy = self.month(post(caption='Initial', outlet_captions={'instagram': 'Initial'}))
        save = image_jobs.save_post

        def concurrent_write(db, row, index, before, after, merge=image_jobs.owner_changes, **options):
            # Model a second tab winning between the handler read and row acquisition.
            save(db, row, index, before, {**before, 'caption': 'Other tab', 'outlet_captions': {'instagram': 'Other tab'}})
            return save(db, row, index, before, after, merge=merge, **options)

        with mock.patch('app.routers.strategy.image_jobs.save_post', side_effect=concurrent_write):
            response = self.save(expected_caption='Initial')
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stored(strategy)['caption'], 'Other tab')

    def test_legacy_noncaption_design_save_remains_supported(self):
        self.month(post())
        self.assertEqual(self.save().status_code, 200)

    def test_concurrent_other_channel_caption_survives_primary_save(self):
        strategy = self.month(post(caption='Initial', outlet_captions={'instagram': 'Initial', 'facebook': 'Old Facebook'}))
        save = image_jobs.save_post

        def other_outlet_write(db, row, index, before, after, merge=image_jobs.owner_changes, **options):
            save(db, row, index, before, {**before, 'outlet_captions': {'instagram': 'Initial', 'facebook': 'New Facebook'}})
            return save(db, row, index, before, after, merge=merge, **options)

        with mock.patch('app.routers.strategy.image_jobs.save_post', side_effect=other_outlet_write):
            response = self.save(expected_caption='Initial')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stored(strategy)['outlet_captions'], {'instagram': 'My recovered wording', 'facebook': 'New Facebook'})

    def test_stale_editor_cannot_write_a_different_post_at_same_index(self):
        strategy = self.month(post(uid='replacement'))
        response = self.save(post_uid='previous-post')
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()['detail']['code'], 'post_changed')
        self.assertEqual(self.stored(strategy)['uid'], 'replacement')
        self.assertNotEqual(self.stored(strategy)['caption'], 'My recovered wording')

    def test_replaced_post_between_read_and_write_is_protected(self):
        strategy = self.month(post())
        save = image_jobs.save_post
        def replace_post(db, row, index, before, after, merge=image_jobs.owner_changes, **options):
            save(db, row, index, before, {**before, 'uid': 'replacement'})
            return save(db, row, index, before, after, merge=merge, **options)
        with mock.patch('app.routers.strategy.image_jobs.save_post', side_effect=replace_post):
            response = self.save()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stored(strategy)['uid'], 'replacement')
        self.assertNotEqual(self.stored(strategy)['caption'], 'My recovered wording')

    def test_removed_post_is_not_reported_as_saved(self):
        strategy = self.month(post())
        save = image_jobs.save_post
        def remove_post(db, row, index, before, after, merge=image_jobs.owner_changes, **options):
            extra = loads(row.roadmap_json, {})
            extra['roadmap']['posts'] = []
            row.roadmap_json = dumps(extra)
            db.commit()
            return save(db, row, index, before, after, merge=merge, **options)
        with mock.patch('app.routers.strategy.image_jobs.save_post', side_effect=remove_post):
            response = self.save()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()['detail']['code'], 'post_changed')
