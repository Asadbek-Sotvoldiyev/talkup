def user_image_path(instance, filename):
    return f"images/{instance.pk}/{filename}"
