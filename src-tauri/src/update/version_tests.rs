use super::*;

#[test]
fn compares_semver_versions() {
    assert!(is_newer("0.1.0", "0.2.0").expect("сравнение"));
    assert!(is_newer("1.0.0", "1.0.1").expect("сравнение"));
    assert!(!is_newer("1.0.1", "1.0.0").expect("сравнение"));
    assert!(!is_newer("1.0.0", "1.0.0").expect("сравнение"));
}

#[test]
fn accepts_leading_v_and_rejects_garbage() {
    assert!(is_newer("1.0.0", "v1.1.0").expect("сравнение"));
    assert!(is_newer("1.0.0", "latest").is_err());
}

#[test]
fn platform_key_has_os_and_arch_parts() {
    let key = platform_key();
    assert!(key.contains('-'), "ключ платформы содержит разделитель");
    assert!(!key.starts_with('-'), "ключ платформы начинается с ОС");
}
