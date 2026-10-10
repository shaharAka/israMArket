"""Actual MP4 finishing plus offline paid-request/tenant boundary tests."""
import _test_env  # noqa: F401
import base64
import io
import json
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from PIL import Image
from fastapi import HTTPException
from app.services import campaign_video as video


class VideoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clip = b""
        cls.audio_clip = b""
        if shutil.which("ffmpeg"):
            with tempfile.TemporaryDirectory() as root:
                source = Path(root)/"source.mp4"
                subprocess.run(["ffmpeg","-nostdin","-v","error","-f","lavfi","-i","testsrc2=size=160x280:rate=12",
                                "-t","2","-c:v","libx264","-threads","2","-y",str(source)], check=True)
                cls.clip = source.read_bytes()
                with_audio = Path(root)/"with-audio.mp4"
                subprocess.run(["ffmpeg","-nostdin","-v","error","-i",str(source),"-f","lavfi","-i","sine=frequency=600:sample_rate=16000",
                                "-t","2","-c:v","copy","-c:a","aac","-y",str(with_audio)],check=True)
                cls.audio_clip = with_audio.read_bytes()

    def overlay(self):
        image = Image.new("RGBA", (720,1280), (0,0,0,0))
        for x in range(54,300):
            for y in range(950,1000): image.putpixel((x,y),(255,0,0,255))
        output = io.BytesIO(); image.save(output,"PNG")
        return output.getvalue()

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg unavailable")
    def test_export_is_decodable_vertical_trim_and_overlay_is_burned(self):
        finished = video.finish_bytes(self.clip, start=.5, end=1.5, overlay=self.overlay())
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/"output.mp4"; path.write_bytes(finished)
            duration,w,h = video.probe(path)
            self.assertAlmostEqual(duration,1,delta=.1); self.assertEqual((w,h),(720,1280))
            frame = subprocess.run(["ffmpeg","-v","error","-i",str(path),"-frames:v","1","-f","image2pipe","-vcodec","png","-"], capture_output=True,check=True).stdout
            with Image.open(io.BytesIO(frame)) as image:
                r,g,b = image.getpixel((80,975))[:3]
                self.assertGreater(r,220); self.assertLess(g,40); self.assertLess(b,40)
        with self.assertRaises(HTTPException): video.finish_bytes(self.clip,start=2,end=3)

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg unavailable")
    def test_visual_edit_preserves_original_soundtrack_with_and_without_overlay(self):
        # The provider's visual clip has no audio. The original 600Hz soundtrack
        # must survive as a real audio stream, with the original duration.
        for overlay in (None, self.overlay()):
            finished = video.finish_bytes(self.clip, audio_source=self.audio_clip, overlay=overlay)
            with tempfile.TemporaryDirectory() as root:
                path = Path(root)/"edited.mp4"; path.write_bytes(finished)
                duration,w,h=video.probe(path)
                self.assertAlmostEqual(duration,2,delta=.1); self.assertEqual((w,h),(720,1280))
                pcm=subprocess.run(["ffmpeg","-nostdin","-v","error","-i",str(path),"-ss","0.5","-t","1",
                    "-vn","-ac","1","-ar","16000","-f","s16le","-"],capture_output=True,check=True).stdout
                samples=struct.unpack("<"+"h"*(len(pcm)//2),pcm)
                crossings=sum(a<=0<b for a,b in zip(samples,samples[1:]))
                self.assertAlmostEqual(crossings,600,delta=5)

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg unavailable")
    def test_provider_edit_runs_real_finishing_and_preserves_soundtrack(self):
        payload={"id":"edit-response","status":"completed","steps":[
            {"type":"model_output","content":[{"type":"video","mime_type":"video/mp4",
                "data":base64.b64encode(self.clip).decode()}]}],
            "usage":{"total_input_tokens":1000,"total_output_tokens":2000}}
        client=mock.MagicMock()
        client.__enter__.return_value.post.return_value=SimpleNamespace(status_code=200,json=lambda:payload)
        with mock.patch.object(video,"available",return_value=True), mock.patch.object(video.httpx,"Client",return_value=client), \
             mock.patch.object(video.media_allowances,"reserve",return_value="attempt"), \
             mock.patch.object(video.media_allowances,"settle") as settle:
            finished=video.generate(None,SimpleNamespace(id=1),{},None,"Change only the wall colour",
                                    "edit-request",source_data=self.audio_clip)
        client.__enter__.return_value.post.assert_called_once()
        body=client.__enter__.return_value.post.call_args.kwargs["json"]
        self.assertEqual(body["generation_config"]["video_config"]["task"],"edit")
        self.assertEqual(body["response_format"],{"type":"video"})
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"edited.mp4"; path.write_bytes(finished)
            duration,w,h=video.probe(path)
            self.assertAlmostEqual(duration,2,delta=.1); self.assertEqual((w,h),(720,1280))
            pcm=subprocess.run(["ffmpeg","-nostdin","-v","error","-i",str(path),"-ss","0.5","-t","1",
                "-vn","-ac","1","-ar","16000","-f","s16le","-"],capture_output=True,check=True).stdout
            samples=struct.unpack("<"+"h"*(len(pcm)//2),pcm)
            self.assertAlmostEqual(sum(a<=0<b for a,b in zip(samples,samples[1:])),600,delta=5)
            uploaded=Path(root)/"uploaded.mp4"; uploaded.write_bytes(base64.b64decode(body["input"][0]["data"]))
            streams=json.loads(subprocess.run(["ffprobe","-v","error","-show_streams","-of","json",str(uploaded)],
                capture_output=True,check=True).stdout)["streams"]
            self.assertFalse(any(stream["codec_type"]=="audio" for stream in streams))
        settle.assert_called_once()
        self.assertEqual(settle.call_args.kwargs["state"],"succeeded")
        self.assertAlmostEqual(settle.call_args.kwargs["cost_usd"],.0365)

    def test_overlay_rejects_remote_urls_dimensions_and_invalid_bytes(self):
        for value in ("https://example.com/overlay.png", "data:image/png;base64,bm90cG5n"):
            with self.assertRaises(HTTPException): video.clean_overlay(value)
        value = "data:image/png;base64,"+base64.b64encode(self.overlay()).decode()
        self.assertTrue(video.clean_overlay(value).startswith(b"\x89PNG"))

    def run_provider(self, payload=None, error=None, status=200):
        business = SimpleNamespace(id=1)
        response = SimpleNamespace(status_code=status, json=lambda: payload)
        client = mock.MagicMock(); client.__enter__.return_value.post.return_value = response
        if error: client.__enter__.return_value.post.side_effect=error
        with mock.patch.object(video,"available",return_value=True), mock.patch.object(video.httpx,"Client",return_value=client), \
             mock.patch.object(video.media_allowances,"reserve",return_value="attempt") as reserve, \
             mock.patch.object(video.media_allowances,"settle") as settle, \
             mock.patch.object(video,"finish_bytes",side_effect=lambda data,**kw:data):
            try:
                result=video.generate(None,business,{"title":"Verified product"},None,"Quiet scene","request-1")
                exc=None
            except HTTPException as e: result=None; exc=e
            return result,exc,client,reserve,settle

    def test_one_bounded_submission_selects_only_completed_model_output(self):
        payload={"id":"response","status":"completed","steps":[
            {"type":"user_input","content":[{"type":"video","data":base64.b64encode(b"original").decode()}]},
            {"type":"model_output","content":[{"type":"video","mime_type":"video/mp4","data":base64.b64encode(b"new").decode()}]}]}
        result,exc,client,reserve,settle=self.run_provider(payload)
        self.assertIsNone(exc); self.assertEqual(result,b"new")
        reserve.assert_called_once(); client.__enter__.return_value.post.assert_called_once()
        body=client.__enter__.return_value.post.call_args.kwargs["json"]
        self.assertEqual(body["generation_config"]["max_output_tokens"],55000)
        self.assertEqual(body["response_format"],{"type":"video","aspect_ratio":"9:16","resolution":"720p"})
        self.assertNotIn("duration_seconds",body["generation_config"]["video_config"])
        self.assertFalse(body["store"]); self.assertEqual(settle.call_args.kwargs["state"],"succeeded")

    def test_ambiguous_failure_is_held_not_retried_or_refunded(self):
        for payload,error,status in (({},None,200), (None,RuntimeError("private key"),200),(None,None,503)):
            _result,exc,client,reserve,settle=self.run_provider(payload,error,status)
            self.assertEqual(exc.status_code,502); self.assertNotIn("private",exc.detail)
            client.__enter__.return_value.post.assert_called_once()
            self.assertEqual(settle.call_args.kwargs["state"],"unknown")

    def test_definite_rejection_is_not_paid_retry(self):
        _result,exc,client,reserve,settle=self.run_provider(status=400)
        self.assertEqual(exc.status_code,502); self.assertEqual(settle.call_args.kwargs["state"],"failed")
        settle.assert_called_once()

    def test_allowance_refusal_precedes_network(self):
        with mock.patch.object(video,"available",return_value=True), mock.patch.object(video.httpx,"Client") as client, \
             mock.patch.object(video.media_allowances,"reserve",side_effect=HTTPException(429,"limit")):
            with self.assertRaises(HTTPException): video.generate(None,SimpleNamespace(id=1),{},None,"","request")
            client.assert_not_called()

if __name__ == "__main__": unittest.main()
